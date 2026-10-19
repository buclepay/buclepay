// @buclepay/node — buclePay API v1 client and webhook verification. No dependencies (Node ≥ 18 fetch and crypto).
// Same style as Stripe: bp.paymentLinks.create(...), bp.subscriptions.retrieve(...), bp.webhooks.constructEvent(...).
import { createHmac, timingSafeEqual } from 'node:crypto';

export class BuclePayError extends Error {
  constructor(message, { status = 0, code = 'error', param = undefined } = {}) {
    super(message);
    this.name = 'BuclePayError';
    this.status = status;
    this.code = code;
    this.param = param;
  }
}

const qs = (o = {}) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
};

export class BuclePay {
  /**
   * @param {string} apiKey `bp_…` key (Dashboard › Developers › API). Server only: never in an app or a web page.
   * @param {{ baseUrl?: string, timeoutMs?: number, fetch?: typeof fetch }} [opts]
   */
  constructor(apiKey, opts = {}) {
    if (typeof apiKey !== 'string' || !/^bp_[A-Za-z0-9_-]{20,80}$/.test(apiKey)) throw new BuclePayError('Missing or malformed API key (bp_…)', { code: 'invalid_api_key' });
    this.apiKey = apiKey;
    this.baseUrl = (opts.baseUrl ?? 'https://app.buclepay.com').replace(/\/$/, '');
    this.timeoutMs = opts.timeoutMs ?? 15_000;
    this._fetch = opts.fetch ?? globalThis.fetch;

    this.paymentLinks = {
      /** A one-time payment (`amount_usd`), a subscription with its own price (`amount_usd` + `interval`) or one of your plans (`plan_id`). */
      create: (params) => this._request('POST', '/payment_links', params),
      retrieve: (id) => this._request('GET', `/payment_links/${encodeURIComponent(id)}`),
      list: (params) => this._request('GET', `/payment_links${qs(params)}`),
    };
    this.subscriptions = {
      retrieve: (id) => this._request('GET', `/subscriptions/${encodeURIComponent(id)}`),
      /** Filters: `client_reference_id`, `email`, `status`. */
      list: (params) => this._request('GET', `/subscriptions${qs(params)}`),
    };
    this.plans = { list: () => this._request('GET', '/plans') };
    this.customers = {
      list: () => this._request('GET', '/customers'),
      /** Level (only if the customer agreed to show it to you) and the rewards it unlocks. Never the score or the history. */
      perks: (id) => this._request('GET', `/customers/${encodeURIComponent(id)}/perks`),
    };
    this.perks = {
      /** Rewards by bucleScore level that you define. Rewards only: never deposits, installments or credit terms. */
      list: () => this._request('GET', '/perks'),
      create: (params) => this._request('POST', '/perks', params),
    };
    this.payments = { list: () => this._request('GET', '/payments') };
    this.events = {
      /** The same events sent by webhook; use it to catch up after downtime. Cursor: `starting_after`. */
      list: (params) => this._request('GET', `/events${qs(params)}`),
    };
    this.webhooks = { constructEvent: constructEvent, verifySignature: verifySignature };
  }

  async _request(method, path, body) {
    let res;
    try {
      res = await this._fetch(`${this.baseUrl}/api/v1${path}`, {
        method,
        headers: { authorization: `Bearer ${this.apiKey}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }), 'user-agent': '@buclepay/node/0.1' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (e) {
      throw new BuclePayError(`Could not reach buclePay: ${e?.message ?? e}`, { code: 'connection_error' });
    }
    let json = null;
    try { json = await res.json(); } catch { /* empty or non-JSON body */ }
    if (!res.ok) {
      const err = json?.error ?? {};
      throw new BuclePayError(err.message ?? `HTTP ${res.status}`, { status: res.status, code: err.code ?? 'error', param: err.param });
    }
    return json;
  }
}

/** Webhook signature: header `buclepay-signature: t=<unix>,v1=<hmac_sha256(secret, "<t>.<body>")>`. */
export function signPayload(secret, body, timestamp) {
  return `t=${timestamp},v1=${createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`;
}

/** true if the signature is valid and recent (5 min by default). `body` must be the EXACT raw text received; never re-serialize the JSON. */
export function verifySignature(body, header, secret, { toleranceSeconds = 300, now = Date.now() } = {}) {
  const m = /t=(\d+),v1=([0-9a-f]{64})/.exec(String(header ?? ''));
  if (!m || typeof body !== 'string' || !secret) return false;
  if (Math.abs(now / 1000 - Number(m[1])) > toleranceSeconds) return false;
  const want = Buffer.from(signPayload(secret, body, Number(m[1])).split('v1=')[1]);
  const got = Buffer.from(m[2]);
  return want.length === got.length && timingSafeEqual(want, got);
}

/** Verifies the signature and returns the parsed event; throws BuclePayError if anything is off (reply 400 and process nothing). */
export function constructEvent(body, header, secret, opts) {
  if (!verifySignature(body, header, secret, opts)) throw new BuclePayError('Invalid or expired webhook signature', { code: 'invalid_signature', status: 400 });
  try { return JSON.parse(body); } catch { throw new BuclePayError('Webhook body is not JSON', { code: 'invalid_payload', status: 400 }); }
}
