// Runs the real migrations in PostgreSQL (PGlite), with local Supabase auth/storage
// fixtures. No live accounts, network calls or project secrets are used.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
let checks = 0;
async function check(name, fn) {
  try { await fn(); checks++; console.log(`ok ${checks} - ${name}`); }
  catch (error) { console.error(`FAIL - ${name}`); throw error; }
}
async function rows(sql, args = []) { return (await db.query(sql, args)).rows; }
async function denied(sql, args = [], pattern = /not authorised|permission denied/) {
  await assert.rejects(db.query(sql, args), pattern);
}
const ids = {
  user: '00000000-0000-4000-8000-000000000001',
  other: '00000000-0000-4000-8000-000000000002',
  mod: '00000000-0000-4000-8000-000000000003',
  admin: '00000000-0000-4000-8000-000000000004',
  dual: '00000000-0000-4000-8000-000000000005',
};
async function as(name) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [ids[name] ?? '']);
  await db.exec(`set role ${name === 'anon' ? 'anon' : 'authenticated'}`);
}
await db.exec(`
  create role anon;
  create role authenticated;
  create role service_role bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz, created_at timestamptz default now(), raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth, public to anon, authenticated, service_role;
  grant execute on function auth.uid() to public;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint);
  create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text);
  create schema cron;
  create function cron.schedule(text, text, text) returns bigint language sql as $$ select 1::bigint $$;
`);
for (const name of fs.readdirSync('supabase/migrations').filter(n => n.endsWith('.sql')).sort()) {
  // PGlite cannot run a background pg_cron worker. Its scheduling call is stubbed;
  // every table, policy, trigger and application function is applied unchanged.
  const sql = fs.readFileSync(`supabase/migrations/${name}`, 'utf8')
    .replace('create extension if not exists pg_cron with schema pg_catalog;', '');
  try {
    await db.exec(sql);
    if (name === '0019_mod_role.sql') {
      await db.exec(sql); // Reapplying the moderator migration remains safe before later schema changes.
      await db.exec(`insert into auth.users(id,email) values ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','legacy@example.test');
        insert into public.submissions(submitted_by,level_name,level_id,recorder,macro_author,file_size)
        values ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','Legacy','123','xdBot','Tester',100);`);
    }
    if (name === '0020_recording_fps.sql') {
      assert.equal((await rows("select fps from public.submissions where level_name='Legacy'"))[0].fps,240);
      await db.exec("delete from auth.users where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'");
    }
  } catch (error) { console.error(`Migration failed: ${name}`); throw error; }
}
console.log('Applied all migrations');
for (const [name, id] of Object.entries(ids)) {
  await db.query('insert into auth.users(id,email,email_confirmed_at) values ($1,$2,now())', [id, `${name}@example.test`]);
  await db.query('insert into public.profiles(id,username) values ($1,$2)', [id, `test_${name}`]);
}
await db.exec(`insert into public.user_roles(user_id,role) values
  ('${ids.mod}','mod'), ('${ids.admin}','admin'), ('${ids.dual}','admin'), ('${ids.dual}','mod');`);
await as('user');
const ticket = (await rows("select * from public.create_support_ticket('suggestion','Test ticket','Please help with this test')"))[0].ticket_id;
await as('other');
const otherTicket = (await rows("select * from public.create_support_ticket('suggestion','Other ticket','Another private thread')"))[0].ticket_id;
await db.exec('reset role');
const submission = (await rows(`insert into public.submissions(submitted_by,level_name,level_id,recorder,macro_author,file_size,fps)
  values ($1,'Test level','123','xdBot','Tester',100,240) returning id`, [ids.user]))[0].id;

await check('anonymous callers cannot read moderation data or execute moderation functions', async () => {
  await as('anon');
  for (const sql of ['select * from public.submissions','select * from public.support_tickets','select * from public.support_ticket_messages','select private.can_moderate()',`select public.delete_support_ticket('${ticket}')`]) await denied(sql);
});
await check('users see their own tickets and submissions only', async () => {
  await as('other');
  assert.equal((await rows('select * from public.submissions')).length, 0);
  assert.deepEqual((await rows('select id from public.support_tickets')).map(r => r.id), [otherTicket]);
  assert.equal((await rows('select * from public.support_ticket_messages where ticket_id=$1', [ticket])).length, 0);
  await denied('select public.add_support_ticket_message($1,$2)', [ticket, 'not mine'], /ticket unavailable/);
});
await check('ordinary users cannot claim, edit, publish, reject, close, delete, ban or record quality checks', async () => {
  await as('user');
  const calls = [
    `select public.start_processing('${submission}')`,
    `select public.release_processing('${submission}')`,
    `select public.finish_processing('${submission}')`,
    `select public.reject_submission('${submission}','test reason')`,
    `select public.admin_update_submission('${submission}','Edited','123',null,null,'Tester',null)`,
    `select public.begin_publish('${submission}')`,
    `select public.get_publish_state('${submission}')`,
    `select public.record_publish_intent('${submission}',1,'tag','file',repeat('a',64))`,
    `select public.record_publish_asset('${submission}',1,'tag',2,'file','https://example.test/file',repeat('a',64))`,
    `select public.record_publish_commit('${submission}',repeat('a',40))`,
    `select public.record_publish_live('${submission}')`,
    `select public.record_publish_error('${submission}','test','error')`,
    `select public.close_support_ticket('${ticket}','resolved','fixed now')`,
    `select public.delete_support_ticket('${ticket}')`,
    `select public.ban_support_ticket_user('${ticket}','test reason')`,
    `select public.unban_support_ticket_user('${ticket}')`,
    `select public.ban_submission_email('user@example.test','test reason')`,
    `select public.unban_submission_email('user@example.test')`,
    `select public.record_macro_quality_check('https://example.test/file','Test','123','Tester','xdBot','good',null)`,
  ];
  for (const sql of calls) await denied(sql);
  for (const rpc of ['list_support_ticket_bans','list_macro_quality_checks']) assert.equal((await rows(`select * from public.${rpc}()`)).length,0);
  await denied('select * from public.list_submission_bans()');
});
await check('mods see all submissions and support threads without becoming admins', async () => {
  await as('mod');
  assert.deepEqual((await rows('select private.can_moderate() as staff, private.is_admin() as admin'))[0], {staff:true,admin:false});
  assert.equal((await rows('select * from public.submissions')).length,1);
  assert.equal((await rows('select * from public.support_tickets')).length,2);
  assert.equal((await rows('select * from public.support_ticket_messages')).length,2);
  assert.deepEqual((await rows('select role from public.user_roles')).map(r=>r.role),['mod']);
});
await check('mods cannot promote themselves, write tables directly, read auth emails or use admin-only RPCs', async () => {
  await as('mod');
  for (const sql of [
    `insert into public.user_roles(user_id,role) values ('${ids.mod}','admin')`,
    `update public.user_roles set role='admin' where user_id='${ids.mod}'`,
    'delete from public.user_roles',
    'select * from auth.users', 'select * from private.submission_publish_state',
    'select * from private.support_ticket_email_jobs',
    `update public.submissions set level_name='bypass' where id='${submission}'`,
    `delete from public.support_tickets where id='${ticket}'`,
    `insert into public.support_ticket_messages(ticket_id,author_id,author_role,body) values ('${ticket}','${ids.mod}','admin','spoof')`,
    'select * from public.admin_operations_summary()',
  ]) await denied(sql);
  assert.equal((await rows('select private.can_send_legal_notice() as allowed'))[0].allowed,false);
  assert.equal((await rows('select * from public.admin_review_activity()')).length,0);
});
await check('mod replies are stamped mod and notify the ticket owner', async () => {
  await as('mod');
  await rows('select public.add_support_ticket_message($1,$2)',[ticket,'Working on this']);
  assert.equal((await rows('select author_role from public.support_ticket_messages where author_id=$1',[ids.mod]))[0].author_role,'mod');
  await as('user');
  assert.equal((await rows("select * from public.account_notifications where kind='support_ticket_reply'")).length,1);
});
await check('owner replies notify admins and mods once even when an account has both roles', async () => {
  await as('user');
  await rows('select public.add_support_ticket_message($1,$2)',[ticket,'Thanks for checking']);
  for(const name of ['mod','admin','dual']) {
    await as(name);
    assert.equal((await rows("select * from public.account_notifications where kind='support_ticket_reply'")).length,1);
  }
});
await check('mods can edit, claim, release and run the full publish lifecycle', async () => {
  await as('mod');
  await rows('select public.admin_update_submission($1,$2,$3,$4,$5,$6,$7)',[submission,'Edited level','123',null,null,'xdBot','Tester']);
  await rows('select public.start_processing($1)',[submission]);
  await rows('select public.release_processing($1)',[submission]);
  await rows('select public.start_processing($1)',[submission]);
  await rows('select public.begin_publish($1)',[submission]);
  await rows('select public.record_publish_intent($1,1,$2,$3,$4)',[submission,'level-123','test.gdr2','a'.repeat(64)]);
  await rows('select public.record_publish_asset($1,1,$2,2,$3,$4,$5)',[submission,'level-123','test.gdr2','https://example.test/test.gdr2','a'.repeat(64)]);
  await rows('select public.record_publish_commit($1,$2)',[submission,'b'.repeat(40)]);
  await rows('select public.record_publish_live($1)',[submission]);
  await rows('select public.finish_processing($1)',[submission]);
  assert.equal((await rows('select * from public.submissions')).length,0);
  await as('user');
  assert.equal((await rows("select * from public.submission_notifications where outcome='accepted'")).length,1);
});
await check('mods can reject submissions and create the submitter notification', async () => {
  await db.exec('reset role');
  const id=(await rows(`insert into public.submissions(submitted_by,level_name,level_id,recorder,macro_author,file_size,fps) values ($1,'Reject test','124','zBot','Tester',100,240) returning id`,[ids.user]))[0].id;
  await as('mod');
  await rows('select public.reject_submission($1,$2)',[id,'Invalid recording']);
  assert.equal((await rows('select * from public.submissions where id=$1',[id])).length,0);
});
await check('mods can manage domain-specific bans but cannot block admins', async () => {
  await as('mod');
  await rows("select public.ban_submission_email('other@example.test','test ban')");
  assert.equal((await rows('select * from public.list_submission_bans()')).length,1);
  await rows("select public.unban_submission_email('other@example.test')");
  await denied("select public.ban_submission_email('admin@example.test','test ban')",[],/administrator/);
  await rows('select public.ban_support_ticket_user($1,$2)',[otherTicket,'test ban']);
  const ban=(await rows('select * from public.list_support_ticket_bans()'))[0];
  await rows('select public.unban_support_ticket_user($1)',[ban.id]);
});
await check('mods can record and list quality checks', async () => {
  await as('mod');
  await rows("select public.record_macro_quality_check('https://example.test/file','Test','123','Tester','xdBot','good',null)");
  assert.equal((await rows('select * from public.list_macro_quality_checks()')).length,1);
});
await check('mods can resolve tickets and permanently delete the transcript and notification jobs', async () => {
  await as('mod');
  await rows('select public.close_support_ticket($1,$2,$3)',[ticket,'resolved','Issue fixed']);
  assert.equal((await rows('select status from public.support_tickets where id=$1',[ticket]))[0].status,'resolved');
  await rows('select public.delete_support_ticket($1)',[ticket]);
  assert.equal((await rows('select * from public.support_ticket_messages where ticket_id=$1',[ticket])).length,0);
  await db.exec('reset role');
  assert.equal((await rows('select * from private.support_ticket_email_jobs where ticket_id=$1',[ticket])).length,0);
  assert.equal((await rows('select * from public.account_notifications where ticket_id=$1',[ticket])).length,0);
});
await check('revoking mod immediately removes cross-user access and write privileges', async () => {
  await db.exec('reset role');
  await db.query("delete from public.user_roles where user_id=$1 and role='mod'",[ids.mod]);
  await as('mod');
  assert.equal((await rows('select private.can_moderate() as allowed'))[0].allowed,false);
  assert.equal((await rows('select * from public.support_tickets')).length,0);
  await denied('select public.delete_support_ticket($1)',[otherTicket]);
  await denied('select public.add_support_ticket_message($1,$2)',[otherTicket,'revoked'],/ticket unavailable/);
});
await check('admins retain moderation and administrative access', async () => {
  await as('admin');
  assert.deepEqual((await rows('select private.can_moderate() as staff, private.is_admin() as admin, private.can_send_legal_notice() as notices'))[0],{staff:true,admin:true,notices:true});
  await rows('select * from public.admin_operations_summary()');
  await rows('select * from public.admin_review_activity()');
  await rows('select public.add_support_ticket_message($1,$2)',[otherTicket,'Admin reply']);
  assert.equal((await rows('select author_role from public.support_ticket_messages where author_id=$1',[ids.admin]))[0].author_role,'admin');
});
await check('role grants stay owner-managed and the assignment snippet validates its target', async () => {
  await db.exec('reset role');
  const grant = fs.readFileSync('supabase/snippets/grant-mod-role.sql','utf8');
  await db.exec(grant.replaceAll('REPLACE_WITH_USERNAME','test_mod'));
  await db.exec(grant.replaceAll('REPLACE_WITH_USERNAME','test_mod'));
  assert.equal((await rows("select * from public.user_roles where user_id=$1 and role='mod'",[ids.mod])).length,1);
  for (const name of ['test_admin','missing_account']) {
    await assert.rejects(db.exec(grant.replaceAll('REPLACE_WITH_USERNAME',name)), /already an admin|No account/);
    await db.exec('rollback');
  }
});


await check('FPS is required, finite and positive at the database boundary', async () => {
  await db.exec('reset role');
  for (const value of [null, 0, -1, 'NaN', 'Infinity', '-Infinity']) {
    await assert.rejects(db.query(`insert into public.submissions(submitted_by,level_name,level_id,recorder,macro_author,file_size,fps)
      values ($1,'Invalid FPS','999','xdBot','Tester',100,$2)`, [ids.user,value]), /submission_fps_valid|not-null/);
  }
  assert.equal((await rows("select to_regprocedure('public.create_submission(uuid,text,text,text,text,text,text,text,integer)') as old"))[0].old,null);
});
await check('declared FPS survives submission, staff editing and the publish snapshot', async () => {
  await db.exec('reset role');
  const id = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  await db.query("insert into storage.objects(bucket_id,name) values ('macro-submissions',$1)",[`${ids.user}/${id}.gdr2`]);
  await as('user');
  await rows('select public.create_submission($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[id,'FPS test','999',null,null,'xdBot','Tester',null,100,59.94]);
  assert.equal((await rows('select fps from public.submissions where id=$1',[id]))[0].fps,59.94);
  await denied('select public.admin_update_submission(p_id => $1, p_fps => $2)',[id,360]);
  await as('mod');
  for(const rate of [0,-1,'NaN','Infinity']) await denied('select public.admin_update_submission(p_id => $1, p_fps => $2)',[id,rate],/submission_fps_valid/);
  await rows('select public.admin_update_submission(p_id => $1, p_fps => $2)',[id,1000000.25]);
  await rows('select public.start_processing($1)',[id]);
  assert.equal((await rows('select * from public.begin_publish($1)',[id]))[0].fps,1000000.25);
  await denied('select public.admin_update_submission(p_id => $1, p_fps => $2)',[id,240],/can no longer be edited|publishing has already started/);
  await db.exec('reset role');
  await denied('update public.submissions set fps=240 where id=$1',[id],/immutable/);
});

await db.close();
console.log(`${checks} PostgreSQL permission scenarios passed`);
