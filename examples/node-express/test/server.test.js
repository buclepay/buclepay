// Checks the two endpoints without calling buclePay: a fake client creates links and real signatures are verified.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BuclePay, signPayload } from '@buclepay/node';
import { createApp } from '../server.js';

const whsec = 'whsec_example_secret';
const fakeFetch = async (url, init) => {
  if (String(url).endsWith('/api/v1/customers/cus_9/perks')) {
    return new Response(JSON.stringify({ data: { object: 'customer_perks', customer: 'cus_9', level_shared: true, level: 3, level_name: 'Shine',
      perks: [{ id: 'prk_1', object: 'perk', min_level: 3, kind: 'discount_pct', value: 10, title: '10% off', active: true }] } }), { status: 200 });
  }
  const body = JSON.parse(init.body);
  return new Response(JSON.stringify({ data: { id: 'pl_1', url: 'https://app.buclepay.com/pay/pl_1', client_reference_id: body.client_reference_id } }), { status: 201 });
};
const bp = new BuclePay('bp_' + 'x'.repeat(30), { fetch: fakeFetch });

async function withServer(fn) {
  const server = createApp({ bp, whsec, publicUrl: 'https://example.com' }).listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await fn(base); } finally { server.close(); }
}
const sign = (obj) => { const body = JSON.stringify(obj); return { body, sig: signPayload(whsec, body, Math.floor(Date.now() / 1000)) }; };
const post = (base, path, body, headers) => fetch(base + path, { method: 'POST', body, headers });
const pro = async (base, user) => (await (await fetch(`${base}/me`, { headers: { 'x-user-id': user } })).json()).pro;

test('creates a link for the signed-in user only', async () => withServer(async (base) => {
  assert.equal((await post(base, '/pay', '{}', { 'content-type': 'application/json' })).status, 401);
  const r = await post(base, '/pay', '{}', { 'content-type': 'application/json', 'x-user-id': 'u1' });
  assert.deepEqual(await r.json(), { url: 'https://app.buclepay.com/pay/pl_1' });
}));

test('grants access on payment.succeeded, once, and removes it on cancel', async () => withServer(async (base) => {
  const paid = sign({ id: 'evt_1', type: 'payment.succeeded', data: { object: { subscription: { client_reference_id: 'u2' } } } });
  assert.equal((await post(base, '/webhooks/buclepay', paid.body, { 'buclepay-signature': paid.sig, 'content-type': 'application/json' })).status, 200);
  assert.equal(await pro(base, 'u2'), true);
  const canceled = sign({ id: 'evt_2', type: 'subscription.canceled', data: { object: { client_reference_id: 'u2' } } });
  await post(base, '/webhooks/buclepay', canceled.body, { 'buclepay-signature': canceled.sig, 'content-type': 'application/json' });
  assert.equal(await pro(base, 'u2'), false);
  // the same paid event again is ignored (already processed)
  await post(base, '/webhooks/buclepay', paid.body, { 'buclepay-signature': paid.sig, 'content-type': 'application/json' });
  assert.equal(await pro(base, 'u2'), false);
}));

test('rejects a forged or altered webhook', async () => withServer(async (base) => {
  const ev = sign({ id: 'evt_3', type: 'payment.succeeded', data: { object: { subscription: { client_reference_id: 'u3' } } } });
  assert.equal((await post(base, '/webhooks/buclepay', ev.body.replace('u3', 'u4'), { 'buclepay-signature': ev.sig })).status, 400);
  assert.equal((await post(base, '/webhooks/buclepay', ev.body, { 'buclepay-signature': 't=1,v1=' + '0'.repeat(64) })).status, 400);
  assert.equal(await pro(base, 'u4'), false);
}));

test('shows bucleScore rewards only for a customer it knows', async () => withServer(async (base) => {
  const none = await (await fetch(`${base}/rewards`, { headers: { 'x-user-id': 'u5' } })).json();
  assert.deepEqual(none, { level_shared: false, level: null, level_name: null, perks: [] });
  const paid = sign({ id: 'evt_5', type: 'payment.succeeded', data: { object: { subscription: { client_reference_id: 'u5', customer: { id: 'cus_9' } } } } });
  await post(base, '/webhooks/buclepay', paid.body, { 'buclepay-signature': paid.sig, 'content-type': 'application/json' });
  const r = await (await fetch(`${base}/rewards`, { headers: { 'x-user-id': 'u5' } })).json();
  assert.equal(r.level, 3);
  assert.equal(r.level_name, 'Shine');
  assert.equal(r.perks[0].kind, 'discount_pct');
}));
