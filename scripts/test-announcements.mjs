import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createJiti } from 'jiti';

const dir = path.resolve('node_modules/.gdm-announcement-tests');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'empty.mjs'), 'export {};');
fs.writeFileSync(path.join(dir, 'supabase.mjs'), 'export const createClient = () => globalThis.__announcementDb;');
fs.writeFileSync(path.join(dir, 'catalog.mjs'), 'export const getCatalogFile = async () => ({text: JSON.stringify(globalThis.__announcementCatalog)});');
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SECRET_KEY = 'fake-test-key';
const jiti = createJiti(import.meta.url, { alias: {
  'server-only': path.join(dir, 'empty.mjs'),
  '@supabase/supabase-js': path.join(dir, 'supabase.mjs'),
  '@/lib/github/contents': path.join(dir, 'catalog.mjs'),
  '@': path.resolve('src'),
} });
const { macroAnnouncement, sendMacroAnnouncement } = await jiti.import(path.resolve('src/lib/publish/announcement.ts'));
const level = { name: 'Bloodbath', levelId: '10565740', slug: 'custom-bloodbath' };
const embed = macroAnnouncement(level, 'ExampleUser');
assert.equal(embed.embeds[0].title, 'New macro available!');
assert.match(embed.embeds[0].description, /A new macro has submitted!/);
assert.match(embed.embeds[0].description, /macro\/custom-bloodbath/);
assert.match(embed.embeds[0].description, /Macro creator:\*\* ExampleUser/);
assert.equal(embed.content, '<@&1562871482961371257>');
assert.deepEqual(embed.allowed_mentions, { parse: [], roles: ['1562871482961371257'] });
assert.match(macroAnnouncement({name:'Bloodbath',levelId:'1'}, 'A*B').embeds[0].description, /A\\\*B/);
assert.match(macroAnnouncement({name:'Bloodbath',levelId:'1'}, 'A').embeds[0].description, /macro\/bloodbath/);
let claims = 0, sends = 0, records = 0, status = 200, claimError = false, empty = false;
globalThis.__announcementCatalog = [level];
globalThis.__announcementDb = {
  rpc: async () => { claims++; return { error: claimError, data: empty ? [] : [{ submission_id: 'test', lease_id: 'lease', level_id: level.levelId, macro_author: 'ExampleUser' }] }; },
  from: () => ({ update: () => { records++; return { eq: () => ({ eq: async () => ({ error: null }) }) }; } }),
};
globalThis.fetch = async (url, options) => {
  sends++;
  assert.equal(url.searchParams.get('wait'), 'true');
  assert.equal(options.redirect, 'error');
  assert.equal(JSON.parse(options.body).embeds[0].description, embed.embeds[0].description);
  return new Response('{}', { status });
};
delete process.env.NEW_MACRO_WEBHOOK;
assert.equal(await sendMacroAnnouncement('test'), 'none');
assert.equal(claims, 0);
process.env.NEW_MACRO_WEBHOOK = 'https://example.test/api/webhooks/123/fake';
assert.equal(await sendMacroAnnouncement('test'), 'failed');
assert.equal(claims, 0);
process.env.NEW_MACRO_WEBHOOK = 'https://discord.com/api/webhooks/123/fake-test-token';
assert.equal(await sendMacroAnnouncement('test'), 'sent');
assert.equal(records, 1);
empty = true;
assert.equal(await sendMacroAnnouncement('test'), 'none');
assert.equal(sends, 1);
empty = false; status = 500;
assert.equal(await sendMacroAnnouncement('test'), 'failed');
assert.equal(records, 1);
globalThis.fetch = async () => { throw new Error('simulated timeout'); };
assert.equal(await sendMacroAnnouncement('test'), 'failed');
claimError = true;
assert.equal(await sendMacroAnnouncement('test'), 'failed');
console.log('Announcement payload, custom slugs, missing configuration, claims, delivery and failure checks passed (mocked network).');
