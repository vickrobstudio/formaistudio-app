import {createFileRoute} from '@tanstack/react-router';
export const Route=createFileRoute('/api/public/payments/webhook')({server:{handlers:{POST:async({request})=>{
 const env=new URL(request.url).searchParams.get('env');
 if(env!=='live'&&env!=='sandbox')return new Response('Invalid environment',{status:400});
 const {verifyWebhook,createStripeClient}=await import('@/lib/stripe.server');
 let event:any;
 try{event=await verifyWebhook(request,env);}catch{return new Response('Invalid signature',{status:400});}
 if(event.livemode!==(env==='live'))return new Response('Environment mismatch',{status:400});
 const types=['customer.subscription.created','customer.subscription.updated','customer.subscription.deleted','invoice.paid','invoice.payment_succeeded'];
 if(!types.includes(event.type))return Response.json({received:true,ignored:true});
 try{
   const object=event.data.object;
   const subId=event.type.startsWith('customer.subscription.')?object.id:object.parent?.subscription_details?.subscription??object.subscription;
   if(!subId)return Response.json({received:true,ignored:'not_subscription'});
   const subscription=await createStripeClient(env).subscriptions.retrieve(typeof subId==='string'?subId:subId.id);
   const {stripeBillingEvent}=await import('@/lib/billing-events');
   const {applyBillingEvent}=await import('@/lib/billing-events.server');
   await applyBillingEvent(stripeBillingEvent(event,subscription,env));
   return Response.json({received:true});
 }catch{console.error('stripe_billing_retry_required',{eventId:event.id,type:event.type});return new Response('Billing reconciliation required',{status:503});}
}}}});
