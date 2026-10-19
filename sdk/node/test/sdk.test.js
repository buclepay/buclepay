// SDK tests (no server): webhook signatures and the route each method calls. Run with `node --test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BuclePay, BuclePayError, constructEvent, signPayload, verifySignature } from '../index.js';

const secret = 'whsec_test';
const body = JSON.stringify({ id: 'evt_1', type: 'payment.succeeded', created: 1, data: {} });
const t = 1_790_000_000;

test('webhooks: accepts a valid signature and rejects an altered, foreign or expired one', () => {
  const header = signPayload(secret, body, t);
  assert.equal(verifySignature(body, header, secret, { now: t * 1000 }), true);
  assert.equal(constructEvent(body, header, secret, { now: t * 1000 }).id, 'evt_1');
  assert.equal(verifySignature(body + ' ', header, secret, { now: t * 1000 }), false);
  assert.equal(verifySignature(body, header, 'whsec_other', { now: t * 1000 }), false);
  assert.equal(verifySignature(body, header, secret, { now: (t + 301) * 1000 }), false);
  assert.throws(() => constructEvent(body, 'nothing', secret), BuclePayError);
});

test('each method calls its route with the key in the header', async () => {
  const calls = [];
  const fakeFetch = async (url, init) => {
    calls.push([init.method, new URL(url).pathname, init.headers.authorization]);
    return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const bp = new BuclePay('bp_' + 'a'.repeat(30), { baseUrl: 'https://app.buclepay.test', fetch: fakeFetch });
  await bp.perks.list();
  await bp.perks.create({ min_level: 3, kind: 'gift', title: 'T-shirt' });
  await bp.customers.perks('cus_1');
  assert.deepEqual(calls.map(([m, p]) => `${m} ${p}`), ['GET /api/v1/perks', 'POST /api/v1/perks', 'GET /api/v1/customers/cus_1/perks']);
  assert.ok(calls.every(([, , a]) => a === `Bearer bp_${'a'.repeat(30)}`));
});

test('API errors arrive as BuclePayError with their code', async () => {
  const fakeFetch = async () => new Response(JSON.stringify({ error: { code: 'credit_like', message: 'no' } }), { status: 400 });
  const bp = new BuclePay('bp_' + 'a'.repeat(30), { fetch: fakeFetch });
  await assert.rejects(bp.perks.create({ min_level: 2, kind: 'custom', title: 'Installments' }), (e) => e instanceof BuclePayError && e.code === 'credit_like' && e.status === 400);
});
