import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifyWebhook } from '../src/lib/stripe.server.ts';
process.env.STRIPE_TEST_WEBHOOK_SECRET='whsec_local_test_only';
const body=JSON.stringify({id:'evt_local',type:'invoice.paid',data:{object:{id:'in_local'}}});
const secret=process.env.STRIPE_TEST_WEBHOOK_SECRET;
function request(timestamp:string,raw=body){const hash=createHmac('sha256',secret).update(`${timestamp}.${body}`).digest('hex');return new Request('http://localhost/webhook',{method:'POST',headers:{'stripe-signature':`t=${timestamp},v1=${hash}`},body:raw});}
const now=String(Math.floor(Date.now()/1000));
assert.equal((await verifyWebhook(request(now),'sandbox')).type,'invoice.paid');
await assert.rejects(()=>verifyWebhook(request(String(Number(now)-600)),'sandbox'));
await assert.rejects(()=>verifyWebhook(request('NaN'),'sandbox'));
await assert.rejects(()=>verifyWebhook(request(now,body.replace('invoice.paid','invoice.deleted')),'sandbox'));
console.log('PASS: valid Stripe signature accepted; stale timestamp, nonnumeric timestamp and changed body rejected.');
