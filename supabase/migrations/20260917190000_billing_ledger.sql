begin;
-- Separate balances by provider and environment. Sandbox never funds live usage.
create table public.billing_wallets (
  user_id uuid not null references auth.users(id),
  environment text not null check(environment in ('live','sandbox')),
  provider text not null check(provider in ('stripe','apple','trial')),
  balance integer not null default 0 check(balance >= 0),
  primary key(user_id,environment,provider)
);
create table public.billing_events (
  provider text not null check(provider in ('stripe','apple')),
  environment text not null check(environment in ('live','sandbox')),
  event_id text not null,
  received_at timestamptz not null default now(),
  primary key(provider,environment,event_id)
);
create table public.billing_grants (
  provider text not null, environment text not null, grant_id text not null,
  user_id uuid not null references auth.users(id), amount integer not null check(amount>0),
  created_at timestamptz not null default now(),
  primary key(provider,environment,grant_id)
);
create table public.billing_entitlements (
  provider text not null, environment text not null, subscription_id text not null,
  user_id uuid not null references auth.users(id), product_id text not null,
  active boolean not null, expires_at timestamptz, event_at timestamptz not null,
  primary key(provider,environment,subscription_id)
);
create table public.generation_operations (
  user_id uuid not null references auth.users(id), operation_id uuid not null,
  environment text not null, provider text not null, fingerprint text not null,
  amount integer not null check(amount>=0),
  status text not null check(status in ('reserved','completed','refunded','uncertain')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key(user_id,operation_id)
);
alter table public.billing_wallets enable row level security;
alter table public.billing_events enable row level security;
alter table public.billing_grants enable row level security;
alter table public.billing_entitlements enable row level security;
alter table public.generation_operations enable row level security;
create policy own_wallet on public.billing_wallets for select to authenticated using(user_id=auth.uid());
create policy own_entitlements on public.billing_entitlements for select to authenticated using(user_id=auth.uid());
revoke all on public.billing_wallets,public.billing_events,public.billing_grants,public.billing_entitlements,public.generation_operations from anon,authenticated;
grant select on public.billing_wallets,public.billing_entitlements to authenticated;
grant all on public.billing_wallets,public.billing_events,public.billing_grants,public.billing_entitlements,public.generation_operations to service_role;

-- One DB transaction: dedupe event, advance subscription state, grant once per
-- paid invoice/transaction. A failed write rolls all three operations back.
create function public.apply_billing_event(
 p_provider text,p_environment text,p_event_id text,p_user_id uuid,
 p_subscription_id text,p_product_id text,p_active boolean,p_expires_at timestamptz,p_event_at timestamptz,
 p_grant_id text default null,p_amount integer default 0
) returns boolean language plpgsql security definer set search_path='' as $$
declare inserted integer;
begin
 if p_provider not in ('stripe','apple') or p_environment not in ('live','sandbox') or
    p_event_id is null or length(p_event_id)=0 or p_amount<0 or p_event_at is null then
   raise exception 'Invalid billing event';
 end if;
 insert into public.billing_events(provider,environment,event_id) values(p_provider,p_environment,p_event_id) on conflict do nothing;
 get diagnostics inserted=row_count;
 if inserted=0 then return false; end if;
 insert into public.billing_entitlements values(p_provider,p_environment,p_subscription_id,p_user_id,p_product_id,p_active,p_expires_at,p_event_at)
 on conflict(provider,environment,subscription_id) do update set
   user_id=excluded.user_id,product_id=excluded.product_id,active=excluded.active,expires_at=excluded.expires_at,event_at=excluded.event_at
 where excluded.event_at > public.billing_entitlements.event_at;
 if p_amount>0 then
   if p_grant_id is null or length(p_grant_id)=0 then raise exception 'Missing grant identity'; end if;
   insert into public.billing_grants(provider,environment,grant_id,user_id,amount) values(p_provider,p_environment,p_grant_id,p_user_id,p_amount) on conflict do nothing;
   get diagnostics inserted=row_count;
   if inserted=1 then
     insert into public.billing_wallets values(p_user_id,p_environment,p_provider,p_amount)
     on conflict(user_id,environment,provider) do update set balance=public.billing_wallets.balance+excluded.balance;
   end if;
 end if;
 return true;
end $$;

create function public.reserve_generation(p_user_id uuid,p_operation_id uuid,p_environment text,p_provider text,p_fingerprint text,p_amount integer)
returns text language plpgsql security definer set search_path='' as $$
declare op public.generation_operations; remaining integer;
begin
 if p_environment not in ('live','sandbox') or p_provider not in ('stripe','apple','trial') or p_amount<0 or p_fingerprint is null then raise exception 'Invalid operation'; end if;
 -- Serialize reservations against the application-wide circuit breaker.
 perform pg_advisory_xact_lock(hashtextextended('formai-generation-budget',0));
 -- Lock per identity so two concurrent requests cannot both spend the last credit.
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
 select * into op from public.generation_operations where user_id=p_user_id and operation_id=p_operation_id;
 if found then
   if op.fingerprint<>p_fingerprint or op.amount<>p_amount or op.environment<>p_environment or op.provider<>p_provider then raise exception 'Operation identity conflict'; end if;
   return op.status;
 end if;
 if (select count(*) from public.generation_operations where created_at>now()-interval '24 hours')>=1000 then return 'daily_limit'; end if;
 if (select count(*) from public.generation_operations where user_id=p_user_id and created_at>now()-interval '15 minutes')>=60 then return 'rate_limit'; end if;
 if (select count(*) from public.generation_operations where user_id=p_user_id and status in ('reserved','uncertain') and created_at>now()-interval '10 minutes')>=2 then return 'busy'; end if;
 if p_amount>0 and p_provider<>'trial' and not exists(select 1 from public.billing_entitlements where user_id=p_user_id and provider=p_provider and environment=p_environment and active and expires_at>now()) then
   return 'subscription_required';
 end if;
 if p_amount>0 then
 update public.billing_wallets set balance=balance-p_amount where user_id=p_user_id and environment=p_environment and provider=p_provider and balance>=p_amount returning balance into remaining;
 if not found then return 'insufficient_credits'; end if;
 end if;
 insert into public.generation_operations values(p_user_id,p_operation_id,p_environment,p_provider,p_fingerprint,p_amount,'reserved',now(),now());
 return 'accepted';
end $$;

create function public.finish_generation(p_user_id uuid,p_operation_id uuid,p_status text)
returns text language plpgsql security definer set search_path='' as $$
declare op public.generation_operations;
begin
 if p_status not in ('completed','refunded','uncertain') then raise exception 'Invalid completion'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
 select * into op from public.generation_operations where user_id=p_user_id and operation_id=p_operation_id for update;
 if not found then raise exception 'Missing operation'; end if;
 if op.status<>'reserved' then return op.status; end if;
 if p_status='refunded' and op.amount>0 then
   update public.billing_wallets set balance=balance+op.amount where user_id=p_user_id and environment=op.environment and provider=op.provider;
 end if;
 update public.generation_operations set status=p_status,updated_at=now() where user_id=p_user_id and operation_id=p_operation_id;
 return p_status;
end $$;
revoke all on function public.apply_billing_event(text,text,text,uuid,text,text,boolean,timestamptz,timestamptz,text,integer) from public,anon,authenticated;
revoke all on function public.reserve_generation(uuid,uuid,text,text,text,integer) from public,anon,authenticated;
revoke all on function public.finish_generation(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.apply_billing_event(text,text,text,uuid,text,text,boolean,timestamptz,timestamptz,text,integer) to service_role;
grant execute on function public.reserve_generation(uuid,uuid,text,text,text,integer) to service_role;
grant execute on function public.finish_generation(uuid,uuid,text) to service_role;
create function public.ensure_trial_wallet(p_user_id uuid,p_environment text) returns void language sql security definer set search_path='' as $$
 insert into public.billing_wallets(user_id,environment,provider,balance) values(p_user_id,p_environment,'trial',4) on conflict do nothing;
$$;
revoke all on function public.ensure_trial_wallet(uuid,text) from public,anon,authenticated;
grant execute on function public.ensure_trial_wallet(uuid,text) to service_role;
create table public.generation_predictions (
 prediction_id text primary key, user_id uuid not null references auth.users(id), created_at timestamptz not null default now()
);
alter table public.generation_predictions enable row level security;
revoke all on public.generation_predictions from public,anon,authenticated;
grant all on public.generation_predictions to service_role;
commit;
