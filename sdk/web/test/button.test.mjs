// Tests for <buclepay-button> with a tiny fake DOM (no dependencies): node --test sdk/web/test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const CODE = readFileSync(new URL('../buclepay-button.js', import.meta.url), 'utf8');

/** Loads the script in a fresh fake window; `calls` records any fetch (the button should make none). */
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
  /** Creates the element with these attributes and "connects" it. */
  const mount = async (attrs) => {
    const el = new Btn();
    Object.assign(el._a, attrs);
    await el.connectedCallback();
    await el._update(); // second pass: same result
    return { el, html: el.shadowRoot.innerHTML };
  };
  return { mount, calls, warns, registry };
}

test('registers <buclepay-button> once, with an open shadow root', async () => {
  const w = load();
  assert.ok(w.registry.get('buclepay-button'));
  const { el } = await w.mount({ link: 'plk_1' });
  assert.equal(el.shadowMode, 'open');
});

test('default: dark pill with the label and the small "with buclePay" mark, no merchant logo and no request', async () => {
  const w = load();
  const { html } = await w.mount({ link: 'https://app.buclepay.com/pay/plk_1', label: 'Subscribe' });
  assert.match(html, /<span class="dark"><a part="button" href="https:\/\/app\.buclepay\.com\/pay\/plk_1">/);
  assert.match(html, /<span class="l">Subscribe<\/span><span class="w" aria-hidden="true">with <span class="bp"/);
  assert.match(html, /height:56px/);
  assert.match(html, /<span class="sr">with buclePay<\/span>/);
  assert.doesNotMatch(html, /class="logo"|<img|class="space"/);
  assert.equal(w.calls.length, 0, 'the button makes no network requests');
});

test('a logo attribute left over from 1.0.0 is ignored', async () => {
  const w = load();
  for (const logo of ['on', 'auto', 'off']) {
    const { html } = await w.mount({ link: 'plk_1', logo });
    assert.doesNotMatch(html, /class="logo"|<img/, logo);
  }
  assert.equal(w.calls.length, 0);
});

test('labels are escaped (no HTML injection)', async () => {
  const w = load();
  const { html } = await w.mount({ link: 'plk_4', label: '"><script>alert(1)</script>' });
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
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
  const w = load({ src: 'http://localhost:3100/js/v1/buclepay-button.js' });
  assert.match((await w.mount({ link: 'plk_5' })).html, /href="http:\/\/localhost:3100\/pay\/plk_5"/);
  const w2 = load({ src: null });
  assert.match((await w2.mount({ link: 'plk_6' })).html, /href="https:\/\/app\.buclepay\.com\/pay\/plk_6"/);
});

test('themes: dark by default, light and lime; unknown values fall back to dark', async () => {
  const w = load();
  assert.match((await w.mount({ link: 'plk_7', theme: 'light' })).html, /<span class="light">/);
  assert.match((await w.mount({ link: 'plk_7', theme: 'lime' })).html, /<span class="lime">/);
  assert.match((await w.mount({ link: 'plk_7', theme: 'red' })).html, /<span class="dark">/);
  // lime: "Pay" and the check in white (brand rule: a different color than "bucl")
  assert.match((await w.mount({ link: 'plk_7' })).html, /\.lime \.bp \.p\{color:#fff\}\.lime \.bp \.c\{stroke:#fff\}/);
});

test('default label follows the page language; the mark says "with buclePay" in every language', async () => {
  const es = load({ lang: 'es-VE' });
  assert.match((await es.mount({ link: 'plk_8' })).html, /<span class="l">Suscribirme<\/span><span class="w" aria-hidden="true">with /);
  const pt = load({ lang: 'pt' });
  assert.match((await pt.mount({ link: 'plk_8' })).html, /<span class="l">Assinar<\/span><span class="w" aria-hidden="true">with /);
  const xx = load({ lang: 'de' });
  assert.match((await xx.mount({ link: 'plk_8' })).html, /<span class="l">Subscribe<\/span><span class="w" aria-hidden="true">with /);
});

test('target="_blank" opens a new tab with rel="noopener"', async () => {
  const w = load();
  assert.match((await w.mount({ link: 'plk_9', target: '_blank' })).html, /target="_blank" rel="noopener"/);
});

test('integrity.json matches this file (the hash sites put in integrity="…")', async () => {
  const { createHash } = await import('node:crypto');
  const meta = JSON.parse(readFileSync(new URL('../integrity.json', import.meta.url), 'utf8'));
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(meta.integrity, `sha384-${createHash('sha384').update(readFileSync(new URL('../buclepay-button.js', import.meta.url))).digest('base64')}`);
  assert.equal(meta.version, pkg.version);
  assert.equal(meta.url, `https://app.buclepay.com/js/v${pkg.version}/buclepay-button.js`);
});
