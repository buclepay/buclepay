# `<buclepay-button>` — the buclePay web button

A custom element any site adds with two lines. No dependencies, no build step, no cookies, no tracking.

```html
<script src="https://app.buclepay.com/js/v1.0.0/buclepay-button.js" integrity="sha384-N/j1epzPDYg2oRPFFC+xgXsomvrGSwdYt+22j9wNWwDQ8SzT2ohvVOWxL/g+r/xs" crossorigin="anonymous" defer></script>

<buclepay-button link="https://app.buclepay.com/pay/plk_…" label="Subscribe"></buclepay-button>
```

![The four variants](../../docs/images/buttons.png)

| Attribute | Values | Default |
|---|---|---|
| `link` | Your payment link (`https://app.buclepay.com/pay/<id>`) or just its id. Required. | — |
| `label` | Your own words: "Subscribe", "Join", "Pay 20 USD"… (60 characters max) | "Subscribe" in the page language (en, es, pt, fr) |
| `theme` | `dark` · `light` (dark pages, next to another dark button) · `lime` (to highlight stablecoins) | `dark` |
| `logo` | `auto` (your logo if you uploaded one) · `on` (your logo or your initials) · `off` (your logo is already above the button: your store, your app, a payment list) | `auto` |
| `target` | `_self` · `_blank` (opens a new tab with `rel="noopener"`) | `_self` |

**Keep the `integrity` and `crossorigin` attributes.** The browser checks that the file is exactly the one published for that version and refuses to run it otherwise. Each version's URL never changes; a new version gets a new URL and a new hash (listed in [integrity.json](integrity.json)).

## How it looks

A 56 px pill with your label and, small inside it, "with buclePay" with the official mark (in every language, like "Pay with Apple Pay"). Your logo goes **inside** the button, on the left, in a white circle with a 1 px gray border, 3 px smaller than the pill's radius (50 px). Use `logo="off"` when your logo is already visible right above the button.

The width is 100% of its container, up to 420 px. Change it from your CSS:

```css
buclepay-button { max-width: 320px; }
```

## What it does

- It is a plain link to your payment page: the customer pays on buclePay and comes back to your `success_url`.
- Your name and logo come from a public, read-only endpoint, `GET https://app.buclepay.com/api/pay/brand?link=<id>` → `{ ok, name, logo }`. It returns only what your payment page already shows. One request per link, without cookies.
- Names and labels are always escaped, and only `https://…/pay/<id>` links are accepted (plain `http` only on `localhost`).

**Grant access only from the verified webhook** (`payment.succeeded`), never because someone clicked the button or came back to your page. See [docs/INTEGRATION.md](../../docs/INTEGRATION.md).

## Plan link or one link per customer

- **Plan link** (from Dashboard › Get paid › Share): the same link for everyone. Ideal for a website or a landing page.
- **One link per customer** (created by your server with the API and your `client_reference_id`): render the page with the `link` your server returned, so the webhook tells you exactly who paid.

## Without JavaScript

Put a normal link inside: it shows only if the script does not load.

```html
<buclepay-button link="https://app.buclepay.com/pay/plk_…">
  <a href="https://app.buclepay.com/pay/plk_…">Subscribe with buclePay</a>
</buclepay-button>
```

## Tests

```bash
cd sdk/web && node --test
```
