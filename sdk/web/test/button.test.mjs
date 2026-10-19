// Tests for <buclepay-button> with a tiny fake DOM (no dependencies): node --test sdk/web/test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const CODE = readFileSync(new URL('../buclepay-button.js', import.meta.url), 'utf8');
const LOGO = '/api/logo?v=0123456789abcdef0123456789abcdef';

/** Loads the script in a fresh fake window. `brands`: link id → brand JSON (missing = 404). */
function load({ brands = {}, lang = 'en', src = 'https://app.buclepay.com/js/v1/buclepay-button.js', fail = false } = {}) {
  const calls = [], warns = [];
  class HTMLElement {
    constructor() { this._a = {}; this.shadowRoot = null; }
    getAttribute(k) { return k in this._a ? this._a[k] : null; }
    attachShadow(o) { this.shadowMode = o.mode; this.shadowRoot = { innerHTML: '' }; return this.shadowRoot; }
    closest() { return null; }
  }
  const registry = new Map();
  const win = {
    HTMLElement, URL, Promise, String, Object, Reflect,
    console: { warn: (m) => warns.push(m) },
    navigator: { language: 'en-US' },
    document: { currentScript: src ? { src } : null, documentElement: { lang } },
    customElements: { get: (n) => registry.get(n), define: (n, c) => registry.set(n, c) },
    fetch: async (url, init) => {
      calls.push({ url, init });
      if (fail) throw new Error('offline');
      const id = new URL(url).searchParams.get('link');
      const b = brands[id];
      return { ok: !!b, json: async () => b };
    },
  };
  win.window = win;
  vm.runInNewContext(CODE, win);
  const Btn = registry.get('buclepay-button');
  /** Creates the element with these attributes, "connects" it and waits for the brand. */
  const mount = async (attrs) => {
    const el = new Btn();
    Object.assign(el._a, attrs);
    await el.connectedCallback();
    await el._update(); // second pass: same result, and the brand comes from the cache
    return { el, html: el.shadowRoot.innerHTML };
  };
  return { mount, calls, warns, registry };
}

test('registers <buclepay-button> once, with an open shadow root', async () => {
  const w = load({ brands: { plk_1: { ok: true, name: 'Yoga Luz', logo: LOGO } } });
  assert.ok(w.registry.get('buclepay-button'));
  const { el } = await w.mount({ link: 'plk_1' });
  assert.equal(el.shadowMode, 'open');
});

test('default: dark pill, merchant logo inside on the left, label and the small "with buclePay" mark', async () => {
  const w = load({ brands: { plk_1: { ok: true, name: 'Yoga Luz', logo: LOGO } } });
  const { html } = await w.mount({ link: 'https://app.buclepay.com/pay/plk_1', label: 'Subscribe' });
  assert.match(html, /<span class="dark"><a part="button" href="https:\/\/app\.buclepay\.com\/pay\/plk_1">/);
  assert.match(html, /<span class="logo" aria-hidden="true"><img alt="" src="https:\/\/app\.buclepay\.com\/api\/logo\?v=0123456789abcdef0123456789abcdef"/);
  assert.match(html, /<span class="l">Subscribe<\/span><span class="w" aria-hidden="true">with <span class="bp"/);
  assert.match(html, /<span class="space"><\/span>/, 'a spacer of the same width keeps the label centered');
  assert.match(html, /height:56px/);
  assert.match(html, /\.logo\{flex:none;width:50px;height:50px;[^}]*background:#fff;border:1px solid #C9C9CE/);
  assert.match(html, /<span class="sr">with buclePay · Yoga Luz<\/span>/);
  assert.equal(w.calls.length, 1);
  assert.equal(w.calls[0].url, 'https://app.buclepay.com/api/pay/brand?link=plk_1');
  assert.equal(w.calls[0].init.credentials, 'omit');
});

test('logo="off" (logo already above the button): no circle and no request', async () => {
  const w = load({ brands: { plk_1: { ok: true, name: 'Yoga Luz', logo: LOGO } } });
  const { html } = await w.mount({ link: 'plk_1', logo: 'off' });
  assert.doesNotMatch(html, /class="logo"/);
  assert.doesNotMatch(html, /class="space"/);
  assert.equal(w.calls.length, 0);
});

test('logo="auto" without a merchant logo: no circle; logo="on": initials', async () => {
  const w = load({ brands: { plk_2: { ok: true, name: 'north studio', logo: null } } });
  assert.doesNotMatch((await w.mount({ link: 'plk_2' })).html, /class="logo"/);
  assert.match((await w.mount({ link: 'plk_2', logo: 'on' })).html, /<span class="logo" aria-hidden="true">NS<\/span>/);
  assert.equal(w.calls.length, 1, 'one request per link');
});

test('a logo from another origin is ignored', async () => {
  const w = load({ brands: { plk_3: { ok: true, name: 'Yoga Luz', logo: 'https://evil.example/x.png' } } });
  const { html } = await w.mount({ link: 'plk_3' });
  assert.doesNotMatch(html, /evil/);
  assert.doesNotMatch(html, /class="logo"/);
});

test('names and labels are escaped (no HTML injection)', async () => {
  const w = load({ brands: { plk_4: { ok: true, name: '<img src=x onerror=alert(1)>', logo: null } } });
  const { html } = await w.mount({ link: 'plk_4', logo: 'on', label: '"><script>alert(1)</script>' });
  assert.doesNotMatch(html, /<img src=x/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('only buclePay payment links: javascript:, plain http, other paths and credentials are refused', async () => {
  const w = load();
  for (const link of ['javascript:alert(1)', 'http://app.buclepay.com/pay/plk_1', 'https://app.buclepay.com/portal', 'https://u:p@app.buclepay.com/pay/plk_1', '', 'a b']) {
    const { html } = await w.mount({ link });
    assert.doesNotMatch(html, /href=/, link);
    assert.match(html, /aria-disabled="true"/, link);
  }
  assert.equal(w.calls.length, 0);
  assert.ok(w.warns.length >= 1);
});

test('an id alone uses the origin the script was loaded from; http works on localhost for development', async () => {
  const w = load({ src: 'http://localhost:3100/js/v1/buclepay-button.js', brands: { plk_5: { ok: true, name: 'Dev', logo: null } } });
  assert.match((await w.mount({ link: 'plk_5', logo: 'off' })).html, /href="http:\/\/localhost:3100\/pay\/plk_5"/);
  await w.mount({ link: 'plk_5' });
  assert.equal(w.calls[0].url, 'http://localhost:3100/api/pay/brand?link=plk_5');
  const w2 = load({ src: null });
  assert.match((await w2.mount({ link: 'plk_6', logo: 'off' })).html, /href="https:\/\/app\.buclepay\.com\/pay\/plk_6"/);
});

test('themes: dark by default, light and lime; unknown values fall back to dark', async () => {
  const w = load();
  assert.match((await w.mount({ link: 'plk_7', logo: 'off', theme: 'light' })).html, /<span class="light">/);
  assert.match((await w.mount({ link: 'plk_7', logo: 'off', theme: 'lime' })).html, /<span class="lime">/);
  assert.match((await w.mount({ link: 'plk_7', logo: 'off', theme: 'red' })).html, /<span class="dark">/);
  // lime: "Pay" and the check in white (brand rule: a different color than "bucl")
  assert.match((await w.mount({ link: 'plk_7', logo: 'off' })).html, /\.lime \.bp \.p\{color:#fff\}\.lime \.bp \.c\{stroke:#fff\}/);
});

test('default label follows the page language; the mark says "with buclePay" in every language', async () => {
  const es = load({ lang: 'es-VE' });
  assert.match((await es.mount({ link: 'plk_8', logo: 'off' })).html, /<span class="l">Suscribirme<\/span><span class="w" aria-hidden="true">with /);
  const pt = load({ lang: 'pt' });
  assert.match((await pt.mount({ link: 'plk_8', logo: 'off' })).html, /<span class="l">Assinar<\/span><span class="w" aria-hidden="true">with /);
  const xx = load({ lang: 'de' });
  assert.match((await xx.mount({ link: 'plk_8', logo: 'off' })).html, /<span class="l">Subscribe<\/span><span class="w" aria-hidden="true">with /);
});

test('target="_blank" opens a new tab with rel="noopener"', async () => {
  const w = load();
  assert.match((await w.mount({ link: 'plk_9', logo: 'off', target: '_blank' })).html, /target="_blank" rel="noopener"/);
});

test('if the brand cannot be loaded (offline, link off), the button still works, without a circle', async () => {
  const w = load({ fail: true });
  const on = await w.mount({ link: 'plk_10', logo: 'on' });
  assert.doesNotMatch(on.html, /class="logo"/);
  assert.match(on.html, /href="https:\/\/app\.buclepay\.com\/pay\/plk_10"/);
  const gone = load({ brands: {} });
  assert.match((await gone.mount({ link: 'plk_11' })).html, /href=/);
});

test('integrity.json matches this file (the hash sites put in integrity="…")', async () => {
  const { createHash } = await import('node:crypto');
  const meta = JSON.parse(readFileSync(new URL('../integrity.json', import.meta.url), 'utf8'));
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(meta.integrity, `sha384-${createHash('sha384').update(readFileSync(new URL('../buclepay-button.js', import.meta.url))).digest('base64')}`);
  assert.equal(meta.version, pkg.version);
  assert.equal(meta.url, `https://app.buclepay.com/js/v${pkg.version}/buclepay-button.js`);
});
