begin;
-- A separate, expiring review wallet; never a purchase or administrator grant.
alter table public.billing_wallets drop constraint billing_wallets_provider_check;
alter table public.billing_wallets add constraint billing_wallets_provider_check check(provider in ('stripe','apple','trial','review'));
create or replace function public.reserve_generation(p_user_id uuid,p_operation_id uuid,p_environment text,p_provider text,p_fingerprint text,p_amount integer)
returns text language plpgsql security definer set search_path='' as $$
declare op public.generation_operations; remaining integer;
begin
 if p_environment not in ('live','sandbox') or p_provider not in ('stripe','apple','trial','review') or p_amount<0 or p_fingerprint is null then raise exception 'Invalid operation'; end if;
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


commit;

