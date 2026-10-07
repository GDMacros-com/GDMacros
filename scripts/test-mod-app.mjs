// Exercise server gates and rendered navigation with mocked external services.
// Database permissions and real RPC behavior are covered by test-mod.mjs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { renderToStaticMarkup } from 'react-dom/server';
const require = createRequire(import.meta.url);
const { jsx } = require('react/jsx-runtime');
let roles = [], signedIn = true, queryError = null, calls = [], id = 'test-user';
let configured = true;
const fail = (name) => () => { throw new Error(`Unexpected external call: ${name}`); };
function query(table) {
  const filters = [];
  const q = {
    select() { return q; },
    eq(key, value) { filters.push([key, [value]]); return q; },
    in(key, values) { filters.push([key, values]); return q; },
    limit() { return q; },
    then(resolve) {
      if (table === 'user_roles') {
        const rows = roles.map(role => ({ role, user_id: id }))
          .filter(row => filters.every(([key, values]) => values.includes(row[key])));
        return Promise.resolve({ data: rows, error: queryError }).then(resolve);
      }
      return Promise.resolve({ data: [], count: 0, error: null }).then(resolve);
    },
  };
  return q;
}
const client = { from: query, rpc: async (name, args) => { calls.push({ name, args }); return { data: null, error: null }; } };
const server = { createClient: async () => configured ? client : null, getUser: async () => signedIn ? { id } : null };
const missing = new Proxy({}, { get: (_, name) => name === '__esModule' ? true : fail(String(name)) });
function load(file, extra = {}) {
  const source = fs.readFileSync(file, 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  const exports = {};
  const mocks = {
    './supabase/server': server,
    '@/lib/supabase/server': server,
    '@/lib/supabase/config': { isSupabaseConfigured: true },
    'next/navigation': { notFound: () => { throw new Error('NOT_FOUND'); }, redirect: () => { throw new Error('REDIRECT'); } },
    'next/cache': { revalidatePath: () => {} },
    'next/link': { __esModule: true, default: ({ children, href }) => jsx('a', { href, children }) },
    ...extra,
  };
  const localRequire = (name) => {
    if (name in mocks) return mocks[name];
    if (name === 'react/jsx-runtime' || name.startsWith('node:')) return require(name);
    if (name.startsWith('@/components/')) return new Proxy({}, { get: () => () => null });
    return missing;
  };
  vm.runInNewContext(code, { exports, require: localRequire, console, process }, { filename: file });
  return exports;
}
const permissions = load('src/lib/admin.ts');
let checks = 0;
async function check(name, fn) { await fn(); console.log(`ok ${++checks} - ${name}`); }
const loadApp = file => load(file, { '@/lib/admin': permissions });
await check('server permission helpers distinguish user, mod, admin and dual roles', async () => {
  for (const [assigned, staff, admin] of [[[],false,false],[['mod'],true,false],[['admin'],true,true],[['mod','admin'],true,true],[['unknown'],false,false]]) {
    roles = assigned;
    assert.equal(await permissions.canCurrentUserModerate(),staff);
    assert.equal(await permissions.isCurrentUserAdmin(),admin);
  }
});
await check('missing sessions, failed role reads and missing config fail closed', async () => {
  roles = ['mod'];
  signedIn = false; assert.equal(await permissions.canCurrentUserModerate(),false); signedIn = true;
  queryError = new Error('read failed'); assert.equal(await permissions.canCurrentUserModerate(),false); queryError = null;
  configured = false; assert.equal(await permissions.canCurrentUserModerate(),false); configured = true;
});
await check('mods see only their three tools; admins retain all eight', async () => {
  const page = loadApp('src/app/admin/page.tsx').default;
  roles = ['mod'];
  const html = renderToStaticMarkup(await page());
  for (const route of ['submissions','inbox','quality']) assert.ok(html.includes(`href="/admin/${route}"`));
  for (const route of ['users','notices','status','activity','macros']) assert.ok(!html.includes(`href="/admin/${route}"`));
  roles = ['admin'];
  assert.equal((renderToStaticMarkup(await page()).match(/href="\/admin\//g) ?? []).length,8);
});
await check('users cannot open moderation routes; mods cannot open administrative routes', async () => {
  for (const name of ['submissions','inbox','quality','users','notices','status','activity','macros']) {
    const page = loadApp(`src/app/admin/${name}/page.tsx`).default;
    roles = [];
    await assert.rejects(page({ searchParams: Promise.resolve({}) }), /NOT_FOUND/);
    if (['users','notices','status','activity','macros'].includes(name)) {
      roles = ['mod'];
      await assert.rejects(page({ searchParams: Promise.resolve({}) }), /NOT_FOUND/);
    }
  }
});
await check('direct moderation server actions reject ordinary users before side effects', async () => {
  roles = [];
  calls = [];
  const actions = {
    submissions: ['startProcessing','releaseProcessing','finishProcessing','rejectSubmission','getSubmissionDownloadUrl','listSubmissionBans','banSubmissionEmail','unbanSubmissionEmail'],
    publish: ['publishMacro','publishMacroForBatch','getPublishState','checkPublishProgress'],
    submissionEdit: ['updateSubmission'], submissionInspect: ['inspectSubmission'],
    adminTools: ['recordQualityCheck'],
    supportTickets: ['closeSupportTicket','banSupportTicketUser','unbanSupportTicketUser','deleteSupportTicket'],
  };
  for (const [file, names] of Object.entries(actions)) {
    const module = loadApp(`src/lib/actions/${file}.ts`);
    for (const name of names) {
      const result = await module[name]('test-id', {});
      assert.match(result.error, /permission|authorised/i, `${name} must deny access`);
    }
  }
  assert.equal(calls.length,0);
});
await check('direct admin actions still reject a moderator before accessing services', async () => {
  roles = ['mod']; calls = [];
  const actions = {
    adminUsers: ['lookupAdminUser'],
    health: ['runHealthChecks','getTrafficStats','getOperationsSummary','getSiteStats'],
    legalNotice: ['previewNotice','sendTestNotice','prepareNotice','sendNextBatch','runStatus'],
  };
  for (const [file,names] of Object.entries(actions)) {
    const module = loadApp(`src/lib/actions/${file}.ts`);
    for (const name of names) assert.match((await module[name]({})).error,/permission|authorised/i, name);
  }
  assert.equal(calls.length,0);
});
await check('a mod can reach review RPCs, and revocation blocks the next action', async () => {
  const actions = loadApp('src/lib/actions/submissions.ts');
  roles = ['mod']; calls = [];
  assert.equal((await actions.startProcessing('test-id')).ok,true);
  assert.equal(calls[0].name,'start_processing');
  roles = [];
  assert.equal((await actions.startProcessing('test-id')).ok,false);
  assert.equal(calls.length,1);
});
console.log(`${checks} application permission scenarios passed`);
