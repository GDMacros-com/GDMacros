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
let roles = [], signedIn = true, queryError = null, calls = [], id = 'test-user', owner = false;
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
const client = {
  from: query,
  rpc: async (name, args) => {
    calls.push({ name, args });
    return { data: name === 'can_manage_staff_roles' ? owner : null, error: null };
  },
};
const server = { createClient: async () => configured ? client : null, getUser: async () => signedIn ? { id } : null };
const missing = new Proxy({}, { get: (_, name) => name === '__esModule' ? true : fail(String(name)) });
function load(file, extra = {}, globals = {}) {
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
  vm.runInNewContext(code, { exports, require: localRequire, console, process, ...globals }, { filename: file });
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
await check('mods see three tools, trial mods see two, and admins retain all nine', async () => {
  const page = loadApp('src/app/admin/page.tsx').default;
  roles = ['mod'];
  const html = renderToStaticMarkup(await page());
  for (const route of ['submissions','inbox','quality']) assert.ok(html.includes(`href="/admin/${route}"`));
  for (const route of ['users','notices','status','activity','macros','legacy-releases']) assert.ok(!html.includes(`href="/admin/${route}"`));
  roles = ['trial_mod'];
  const trialHtml = renderToStaticMarkup(await page());
  assert.deepEqual([...trialHtml.matchAll(/href="\/admin\/([^"]+)"/g)].map(match => match[1]), ['submissions', 'quality']);
  roles = ['admin'];
  assert.equal((renderToStaticMarkup(await page()).match(/href="\/admin\//g) ?? []).length,9);
});
await check('users cannot open staff routes, and trial mods also cannot open support or admin tools', async () => {
  for (const name of ['submissions','inbox','quality','users','notices','status','activity','macros','legacy-releases']) {
    const page = loadApp(`src/app/admin/${name}/page.tsx`).default;
    roles = [];
    await assert.rejects(page({ searchParams: Promise.resolve({}) }), /NOT_FOUND/);
    if (['users','notices','status','activity','macros','legacy-releases'].includes(name)) {
      roles = ['mod'];
      await assert.rejects(page({ searchParams: Promise.resolve({}) }), /NOT_FOUND/);
    }
    if (!['submissions', 'quality'].includes(name)) {
      roles = ['trial_mod'];
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
await check('only the owner can change roles and both UI confirmations are required by the action', async () => {
  const { updateStaffRole } = load('src/lib/actions/adminUsers.ts', {
    '@/lib/staffRoles': load('src/lib/staffRoles.ts'),
  });
  calls = [];
  assert.equal((await updateStaffRole('target', [], 'trial_mod', true, 100)).ok, false);
  owner = true;
  assert.equal((await updateStaffRole('target', [], 'trial_mod', false, 100)).ok, false);
  assert.equal((await updateStaffRole('target', [], 'trial_mod', true, 99)).ok, false);
  assert.equal((await updateStaffRole('target', [], 'unrecognized', true, 100)).ok, false);
  assert.equal(calls.filter(call => call.name === 'set_staff_role').length, 0);
  assert.equal((await updateStaffRole('target', [], 'trial_mod', true, 100)).ok, true);
  assert.equal(calls.at(-1).args.p_role, 'trial_mod');
  owner = false;
});
await check('quality checks reject legacy catalog URLs and send verified metadata to the trial writer', async () => {
  const current = 'https://example.test/current';
  const legacy = 'https://example.test/legacy';
  const writes = [];
  const tools = load('src/lib/actions/adminTools.ts', {
    '@/lib/admin': permissions,
    '@/lib/macros': { getAllLevels: (archived) => [{
      name: 'Test', levelId: 123,
      macros: [{ downloadLink: archived ? legacy : current, recorder: 'Silicate', author: 'Tester' }],
    }] },
    '@/lib/trialMod': {
      recordTrialModQualityCheck: async (actorId, args) => { writes.push({ actorId, args }); return { error: null }; },
      scheduleTrialModLogDelivery: () => {},
    },
  });
  roles = ['trial_mod'];
  assert.equal((await tools.recordQualityCheck(legacy, 'good', '')).ok, false);
  assert.equal(writes.length, 0);
  assert.equal((await tools.recordQualityCheck(current, 'good', '')).ok, true);
  assert.equal(writes[0].args.p_download_url, current);
  assert.equal(writes[0].args.p_level_id, '123');
});
await check('Discord drops old view events, pings ChesszDC for moderation results and retries failures', async () => {
  const messages = [];
  const deleted = [];
  let success = false;
  const job = { id: 'event-id', lease_id: 'lease-id', actor_username: 'test_trial', actor_id: 'trial',
    created_at: '2026-11-26T14:00:00Z', action: 'rejected', target_id: 'submission-id', level_name: 'Test', detail: 'Reason' };
  const viewJob = { ...job, id: 'view-id', action: 'review_queue_viewed' };
  const service = {
    rpc: async () => ({ data: deleted.length === 0 ? [viewJob] : deleted.length === 1 ? [job] : [], error: null }),
    from: () => ({
      delete: () => ({
        eq: (key, value) => ({ eq: (leaseKey, leaseValue) => {
          deleted.push([key, value, leaseKey, leaseValue]);
          return { error: null };
        } }),
      }),
    }),
  };
  const logs = load('src/lib/trialMod.ts', {
    'server-only': {},
    '@supabase/supabase-js': { createClient: () => service },
    '@/lib/supabase/config': { SUPABASE_URL: 'https://example.test' },
  }, {
    process: { env: { SUPABASE_SECRET_KEY: 'mock', TMOD_LOG_WEBHOOK: 'https://discord.com/api/webhooks/123/mock' } },
    URL, AbortSignal,
    fetch: async (url, options) => {
      assert.equal(url.searchParams.get('wait'), 'true');
      messages.push(JSON.parse(options.body));
      return { ok: success };
    },
  });
  assert.equal((await logs.drainTrialModLogs()).failed, true);
  assert.deepEqual(deleted, [['id', 'view-id', 'lease_id', 'lease-id']]);
  assert.equal(messages.length, 1);
  success = true;
  assert.equal((await logs.drainTrialModLogs()).sent, 1);
  assert.deepEqual(deleted[1], ['id', 'event-id', 'lease_id', 'lease-id']);
  for (const message of messages) {
    assert.equal(message.content, '<@1488686761264549939>');
    assert.equal(message.embeds[0].title, 'Trial Mod · Submission denied');
    assert.deepEqual(message.allowed_mentions, { parse: [], users: ['1488686761264549939'] });
    assert.match(message.embeds[0].description, /test_trial.*\n.*Test.*\n.*submission-id.*\nReason/);
  }
});
console.log(`${checks} application permission scenarios passed`);
