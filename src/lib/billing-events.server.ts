import {supabaseAdmin} from '@/integrations/supabase/client.server';
import {billingRpcArgs,type BillingEvent} from './billing-events';
export async function applyBillingEvent(event:BillingEvent){
  const {error}=await (supabaseAdmin as any).rpc('apply_billing_event',billingRpcArgs(event));
  if(error) throw new Error('Billing transaction failed');
}
