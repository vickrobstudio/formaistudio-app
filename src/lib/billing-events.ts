import { creditsForPlan } from "./plans.ts";
export type BillingEnvironment="live"|"sandbox";
export type BillingEvent={provider:"stripe"|"apple";environment:BillingEnvironment;eventId:string;userId:string;subscriptionId:string;productId:string;active:boolean;expiresAt:string|null;eventAt:string;grantId:string|null;amount:number};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function date(ms:unknown){if(typeof ms!=="number"||!Number.isFinite(ms)||ms<=0)throw new Error("Missing billing timestamp");return new Date(ms).toISOString();}
export function revenueCatEvent(e:any):BillingEvent|null {
  if(e?.type==="TEST")return null;
  const supported=["INITIAL_PURCHASE","RENEWAL","CANCELLATION","UNCANCELLATION","EXPIRATION","BILLING_ISSUE","SUBSCRIPTION_PAUSED"];
  if(!supported.includes(e?.type))throw new Error("RevenueCat event requires reconciliation");
  if(!uuid.test(e.app_user_id??""))throw new Error("RevenueCat identity requires reconciliation");
  if(!e.id||!e.original_transaction_id||!e.product_id||!["PRODUCTION","SANDBOX"].includes(e.environment))throw new Error("Incomplete RevenueCat event");
  const productId=String(e.product_id).replace(/^app\.formaistudio\.formai\./,"");
  if(!creditsForPlan(productId))throw new Error("Unknown subscription product");
  const expiresAt=date(e.expiration_at_ms);
  const isGrant=["INITIAL_PURCHASE","RENEWAL"].includes(e.type);
  if(isGrant&&!e.transaction_id)throw new Error("Missing paid transaction");
  // Cancellation stops renewal, not the paid term; immediate revocations carry
  // EXPIRATION or a shortened expiry. Never set the owner's VIP flag here.
  const active=e.type!=="EXPIRATION"&&e.cancel_reason!=="CUSTOMER_SUPPORT";
  return {provider:"apple",environment:e.environment==="SANDBOX"?"sandbox":"live",eventId:e.id,userId:e.app_user_id,subscriptionId:e.original_transaction_id,productId,active,expiresAt,eventAt:date(e.event_timestamp_ms),grantId:isGrant?String(e.transaction_id):null,amount:isGrant?creditsForPlan(productId):0};
}
export function stripeBillingEvent(event:any,subscription:any,environment:BillingEnvironment):BillingEvent {
  if(!event.id||event.livemode!==(environment==="live")||!uuid.test(subscription.metadata?.userId??""))throw new Error("Invalid Stripe event identity/environment");
  const items=subscription.items?.data??[];
  if(items.length!==1)throw new Error("Subscription items require reconciliation");
  const item=items[0];
  const productId=item.price?.lookup_key||item.price?.metadata?.lovable_external_id;
  const allowance=creditsForPlan(productId);
  if(!allowance)throw new Error("Unknown Stripe plan");
  const invoice=event.data.object;
  const paid=["invoice.paid","invoice.payment_succeeded"].includes(event.type)&&invoice.paid===true&&["subscription_create","subscription_cycle"].includes(invoice.billing_reason);
  const active=["active","trialing"].includes(subscription.status);
  return {provider:"stripe",environment,eventId:event.id,userId:subscription.metadata.userId,subscriptionId:subscription.id,productId,active,expiresAt:date((item.current_period_end??subscription.current_period_end)*1000),eventAt:date(event.created*1000),grantId:paid?invoice.id:null,amount:paid?allowance:0};
}
export function billingRpcArgs(e:BillingEvent){return {p_provider:e.provider,p_environment:e.environment,p_event_id:e.eventId,p_user_id:e.userId,p_subscription_id:e.subscriptionId,p_product_id:e.productId,p_active:e.active,p_expires_at:e.expiresAt,p_event_at:e.eventAt,p_grant_id:e.grantId,p_amount:e.amount};}
