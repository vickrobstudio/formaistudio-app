import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
const user = '11111111-1111-4111-8111-111111111111';
const other = '11111111-1111-4111-8111-111111111112';
const op = '22222222-2222-4222-8222-222222222221';
await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select null::uuid$$;insert into auth.users values('${user}'),('${other}');`);
for (const file of ['20260917190000_billing_ledger.sql','20260917220000_review_wallet.sql']) {
  await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
}
await db.query(`insert into billing_wallets values($1,'live','review',50)`,[user]);
await db.query(`insert into billing_entitlements values('review','live','review-1',$1,'pro_monthly',true,now()+interval '30 days',now())`,[user]);
const reserve = async (who=user, id=op, env='live') => (await db.query<any>(`select reserve_generation($1,$2,$3,'review','image:test',1) as status`,[who,id,env])).rows[0].status;
assert.equal(await reserve(other),'subscription_required');
assert.equal(await reserve(user,op,'sandbox'),'subscription_required');
assert.equal(await reserve(),'accepted');
assert.equal(await reserve(),'reserved');
assert.equal((await db.query<any>('select balance from billing_wallets')).rows[0].balance,49);
await db.query(`select finish_generation($1,$2,'completed')`,[user,op]);
await db.exec(`update billing_entitlements set expires_at=now()-interval '1 second'`);
assert.equal(await reserve(user,'22222222-2222-4222-8222-222222222222'),'subscription_required');
await db.exec('set role authenticated');
await assert.rejects(()=>db.exec('update billing_wallets set balance=500'));
await assert.rejects(()=>reserve());
await db.close();
console.log('PASS review wallet: finite credits, deduplication, expiry, user/environment isolation and no client write access');

