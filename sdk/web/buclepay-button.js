/*! buclePay button <buclepay-button> · MIT · no dependencies
 *
 * Load it with the exact <script> tag from README.md (versioned URL + integrity="sha384-…" + crossorigin="anonymous"),
 * then: <buclepay-button link="https://app.buclepay.com/pay/plk_…" label="Subscribe"></buclepay-button>
 *
 * Attributes
 *   link   (required) the payment link URL (…/pay/<id>) or just its id
 *   label  the merchant's words: "Subscribe", "Pay 20 USD"… (default: "Subscribe" in the page language)
 *   theme  dark (default) | light | lime
 *   target _self (default) | _blank
 *
 * The button is a plain link: it makes no network requests, sets no cookies and tracks nothing. The customer pays on
 * buclePay and comes back to the merchant's success URL. Grant access only from the verified webhook, never from this button.
 * (Since 1.0.1 the button carries no merchant logo; a `logo` attribute from 1.0.0 is ignored.)
 */
(function () {
  'use strict';
  if (typeof window === 'undefined' || !window.customElements || window.customElements.get('buclepay-button')) return;

  var DEFAULT_ORIGIN = 'https://app.buclepay.com';
  var script = document.currentScript;
  var BASE = (function () {
    try { return script && script.src ? new URL(script.src).origin : DEFAULT_ORIGIN; } catch (e) { return DEFAULT_ORIGIN; }
  })();
  // default label in the page language; the mark says "with buclePay" in every language (like "Pay with Apple Pay")
  var LABELS = { en: 'Subscribe', es: 'Suscribirme', pt: 'Assinar', fr: "S'abonner" };
  var THEMES = { dark: 1, light: 1, lime: 1 };

  var esc = function (s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  };
  var isLocal = function (h) { return h === 'localhost' || h === '127.0.0.1' || /\.localhost$/.test(h); };

  /** link → { origin, id, href } or null. Only https (http on localhost) and only …/pay/<id>. */
  function parseLink(raw, base) {
    raw = (raw || '').trim();
    if (/^[\w-]{1,64}$/.test(raw)) return { origin: base, id: raw, href: base + '/pay/' + raw };
    var u;
    try { u = new URL(raw); } catch (e) { return null; }
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && isLocal(u.hostname))) return null;
    if (u.username || u.password) return null;
    var m = /^\/pay\/([\w-]{1,64})\/?$/.exec(u.pathname);
    return m ? { origin: u.origin, id: m[1], href: u.href } : null;
  }

  var MARK = '<span class="bp"><span>bucl</span><svg viewBox="0 0 60 56"><path class="a" d="M44.5 12.2 A21.5 21.5 0 1 0 45.5 42.9"/>' +
    '<path class="c" d="M13 25 L24 34 L54.5 12.5"/></svg><span class="p">Pay</span></span>';

  var CSS = ':host{display:block;width:100%;max-width:420px;font-family:inherit}' +
    'a{box-sizing:border-box;height:56px;width:100%;border-radius:999px;display:flex;align-items:center;justify-content:center;gap:0;' +
    'padding:3px;text-decoration:none;background:#111111;color:#fff;font-family:inherit;font-size:16px;font-weight:600;line-height:1.1;cursor:pointer;' +
    '-webkit-tap-highlight-color:transparent;transition:opacity .15s,transform .15s}' +
    'a:hover{opacity:.9}a:active{transform:scale(.98)}a:focus-visible{outline:1px solid #C9C9CE;outline-offset:3px}' +
    'a[aria-disabled=true]{opacity:.45;cursor:not-allowed}' +
    '.txt{flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:3px;padding:0 15px}' +
    '.l{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.w{display:inline-flex;align-items:baseline;gap:4px;font-size:10.5px;font-weight:500;color:#9A9AA2}' +
    '.bp{font-size:12px;font-weight:700;letter-spacing:-.05em;display:inline-flex;align-items:baseline;white-space:nowrap;color:#fff}' +
    '.bp svg{width:.58em;height:.56em;overflow:visible;margin:0 .01em 0 .015em;flex:none}' +
    '.bp path{fill:none;stroke-linecap:round;stroke-linejoin:round}.bp .a{stroke:currentColor;stroke-width:13}.bp .c{stroke:#B5E300;stroke-width:11}' +
    '.bp .p{color:#B5E300}' +
    '.light a{background:#F5F5F6;color:#111111}.light .w{color:#8A8A93}.light .bp{color:#111111}' +
    '.lime a{background:#B5E300;color:#111111}.lime .w{color:#3A4A00}.lime .bp{color:#111111}.lime .bp .p{color:#fff}.lime .bp .c{stroke:#fff}' +
    '.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}' +
    '@media (prefers-reduced-motion:reduce){a{transition:none}a:active{transform:none}}';

  function lang(el) {
    var l = (el.closest && el.closest('[lang]') && el.closest('[lang]').getAttribute('lang')) || document.documentElement.lang || navigator.language || 'en';
    l = String(l).slice(0, 2).toLowerCase();
    return LABELS[l] ? l : 'en';
  }

  /** The button's HTML. The label is always escaped. */
  function render(o) {
    var text = '<span class="txt"><span class="l">' + esc(o.label) + '</span><span class="w" aria-hidden="true">with ' + MARK + '</span></span>';
    var sr = '<span class="sr">with buclePay</span>';
    var attrs = o.link ? 'href="' + esc(o.link.href) + '"' + (o.target === '_blank' ? ' target="_blank" rel="noopener"' : '')
      : 'role="link" aria-disabled="true"';
    return '<style>' + CSS + '</style><span class="' + o.theme + '"><a part="button" ' + attrs + '>' +
      text + sr + '</a></span>';
  }

  class Button extends HTMLElement {
    static get observedAttributes() { return ['link', 'label', 'theme', 'target']; }
    connectedCallback() { this._update(); }
    attributeChangedCallback() { if (this._root) this._update(); }
    _update() {
      if (!this._root) this._root = this.attachShadow({ mode: 'open' });
      var link = parseLink(this.getAttribute('link'), BASE);
      var theme = this.getAttribute('theme') || 'dark';
      var o = {
        link: link, label: (this.getAttribute('label') || '').trim().slice(0, 60) || LABELS[lang(this)],
        theme: THEMES[theme] ? theme : 'dark', target: this.getAttribute('target'),
      };
      if (!link && window.console) console.warn('<buclepay-button>: the "link" attribute must be a buclePay payment link (https://…/pay/<id>)');
      this._root.innerHTML = render(o);
      return Promise.resolve();
    }
  }

  window.customElements.define('buclepay-button', Button);
})();
