import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
const user = '11111111-1111-4111-8111-111111111111';
const operation = '22222222-2222-4222-8222-222222222222';
await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select null::uuid$$;insert into auth.users values('${user}');`);
await db.exec(await readFile(new URL('../supabase/migrations/20260917190000_billing_ledger.sql', import.meta.url), 'utf8'));
const reserve = async () => (await db.query<any>(`select public.reserve_generation($1,$2,'live','trial','photo:fixture',0) as status`, [user,operation])).rows[0].status;
assert.equal(await reserve(), 'accepted', 'Free Photo AI works without a funded wallet or subscription');
assert.equal(await reserve(), 'reserved', 'Repeated Photo AI request cannot invoke the provider twice');
await db.query(`select public.finish_generation($1,$2,'completed')`, [user,operation]);
assert.equal((await db.query<any>('select amount from generation_operations')).rows[0].amount, 0);
assert.equal((await db.query<any>('select count(*)::int as n from billing_wallets')).rows[0].n, 0, 'No credit grant or deduction for free Photo AI');
await db.close();
console.log('PASS free Photo AI: zero credits, no subscription required, duplicate operation blocked');

