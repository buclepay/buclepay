# Integrate buclePay

buclePay works like Stripe Checkout, paid in stablecoins and without custody: **your server creates a payment link, your customer opens it and signs once in their own wallet, and buclePay tells your server by signed webhook.** Every charge goes from the customer's wallet to yours in one on-chain transaction. buclePay never holds the money.

![How it works](images/flow.png)

```
App / site ──(1) "I want to pay"──────▶ Your server ──(2) POST /api/v1/payment_links──▶ buclePay
App / site ◀──(3) link url ───────────  Your server
App / site ──(4) opens the url; the customer signs in their wallet ──────────────────▶ buclePay
Your server ◀──(5) signed webhook: payment.succeeded (with your client_reference_id) ── buclePay
Your server  (6) grants the service and tells the app
```

Contents: [Before you start](#before-you-start) · [1. Create the link](#1-create-the-link) · [2. Receive the payment](#2-receive-the-payment-webhooks) · [3. Mobile apps](#3-mobile-apps-flutter-ios-android) · [4. Web and web apps](#4-web-and-web-apps) · [5. bucleScore rewards](#5-buclescore-reward-your-best-customers) · [6. API reference](#6-api-reference) · [7. Testing](#7-testing) · [8. Security rules](#8-security-rules) · [9. Platforms](#9-platforms-coming-soon)

## Before you start

1. Create a buclePay account (person or company) at **app.buclepay.com** and add the wallet where you want to receive payments.
2. **Dashboard › Developers › API**: create an API key `bp_…`. It is shown once. Keep it in your server's secret store.
3. **Dashboard › Developers › Webhooks**: add your `https://` endpoint and choose the events (or `*`). Copy the secret `whsec_…`, shown once.
4. Install the SDK on your server:

```bash
npm i @buclepay/node
```

Any other language works with plain HTTP (see [API reference](#6-api-reference)).

**Networks and currencies:** USDT and USDC on Polygon, BNB Chain, Arbitrum and Base (USDC only on Base). The customer picks the network and currency in the checkout. They need the stablecoin plus a little of the network's gas coin (POL, BNB or ETH) to approve the permission once.

## 1. Create the link

```js
import { BuclePay } from '@buclepay/node';
const bp = new BuclePay(process.env.BUCLEPAY_API_KEY); // bp_… server only

const { data: link } = await bp.paymentLinks.create({
  amount_usd: 49.99,
  interval: 'month',                  // without interval = one-time payment
  description: 'Pro plan',
  client_reference_id: 'user_123',    // YOUR id for the user or order
  metadata: { plan: 'pro' },
  success_url: 'https://example.com/billing/done',   // or your app scheme: myapp://pay
  cancel_url: 'https://example.com/billing',
});
// send link.url to the browser or app
```

| Field | What it does |
|---|---|
| `amount_usd` | Amount in USD, minimum 1.99, maximum 100,000, cents allowed. |
| `interval` + `interval_count` | Subscription: `day` (1–365), `week` (1 or 2), `month` (1 or 3), `year` (1). Without `interval` it is a one-time payment. |
| `max_charges` | Installments: charging stops by itself after the last one (2–120). Needs `interval`. |
| `trial_days` | Free days before the first charge (0–90). Needs `interval`. |
| `plan_id` | Instead of the above: subscribe to a plan created in the dashboard (`GET /api/v1/plans`). |
| `description` | What the customer sees: up to 80 characters for subscriptions, 120 for one-time payments. |
| `client_reference_id` | Your id (user, order…), up to 200 characters. **It comes back in the API and in every webhook of that subscription.** |
| `metadata` | Up to 20 pairs; key 1–40 characters (`A-Z a-z 0-9 _ . -`); value up to 500. **No personal data.** |
| `expires_in_days` | 1–90 (default 3). Create the link when the customer taps "pay", not before. |
| `success_url` | Where the customer goes back when done: a public `https://` URL or your app scheme (`myapp://pay`). buclePay appends `bp_link`, `bp_status=completed` and `bp_subscription`. |
| `cancel_url` | Same, for "Cancel and go back" and failed payments (`bp_status=canceled` or `failed`). |

**Every link created through the API can be paid once**, like a Stripe Checkout session: after one customer signs, anyone opening it again sees "This payment is already done". If the customer reloads the page (common on phones when coming back from the wallet), they resume the same payment where they were: they never pay twice. `http://`, `javascript:`, `data:`, `intent:`, `file:` or URLs with user and password are rejected.

The price can differ per customer (discounts, regional prices): API links do not clutter the plan catalog in your dashboard.

## 2. Receive the payment (webhooks)

```js
// Express: you need the RAW body as text, never re-serialized JSON
app.post('/webhooks/buclepay', express.text({ type: '*/*' }), async (req, res) => {
  let event;
  try {
    event = bp.webhooks.constructEvent(req.body, req.get('buclepay-signature'), process.env.BUCLEPAY_WHSEC);
  } catch {
    return res.sendStatus(400); // bad or expired signature: process nothing
  }
  if (await alreadyProcessed(event.id)) return res.sendStatus(200); // events can arrive more than once

  if (event.type === 'payment.succeeded') {
    const invoice = event.data.object;
    await grantAccess(invoice.subscription.client_reference_id);
  } else if (['subscription.suspended', 'subscription.canceled', 'subscription.ended', 'mandate.revoked'].includes(event.type)) {
    await revokeAccess(event.data.object.client_reference_id);
  } else if (event.type === 'subscription.reactivated') {
    await grantAccess(event.data.object.client_reference_id);
  }
  res.sendStatus(200); // any 2xx = received; otherwise retried after 1 min, 5 min, 30 min, 2 h, 6 h and 1 day
});
```

**Signature:** header `buclepay-signature: t=<unix>,v1=<hmac_sha256(secret, "<t>.<raw body>")>`, the same scheme as Stripe. It expires after 5 minutes. The SDK compares in constant time.

**Body:** `{ id, type, created (unix), api_version, data }`. `data` keeps the event details (`subscription_id`, `invoice_id`, reason…) and adds **`data.object`**:

| Event | `data.object` |
|---|---|
| `payment.succeeded`, `payment.failed`, `payment.retry_scheduled`, `invoice.paid` | **Invoice**, with its subscription inside |
| `subscription.created`, `.past_due`, `.suspended`, `.reactivated`, `.canceled`, `.ended`, `mandate.registered`, `mandate.revoked` | **Subscription** |
| `checkout.completed`, `checkout.failed` | **Payment link** (with `client_reference_id`, `metadata`, `completed`, `subscription_id`) |
| `merchant.*`, `payout.*`, `test.ping` | none |

`checkout.failed` includes `data.reason`: `allowance_missing` (the customer did not approve the permission), `expired_signature`, `register_reverted` / `register_dropped` (the network rejected or dropped the registration), `nonce_revoked`, `wallet_rejected` (that wallet cannot be used). **Nothing was charged** in any of these cases; create a new link to try again.

**Invoice** (`object: "invoice"`): `id`, `number`, `status`, `amount_usd`, `subtotal_usd`, `discount_usd`, `fee_usd`, `net_usd`, `fee_bps`, `period_start`, `period_end`, `due_at`, `paid_at`, `subscription_id`, and

```json
"payment": { "token": "USDT", "chain_id": 137, "chain": "Polygon", "tx_hash": "0x…", "explorer_url": "https://polygonscan.com/tx/0x…" },
"subscription": { … }
```

**Subscription** (`object: "subscription"`): `id`, `status` (`trialing`, `active`, `grace`, `suspended`, `canceled`, `ended`, `paused`), **`active`** (true = provide the service: paid up, in trial or in grace), `plan`, `plan_id`, `amount_usd`, `interval`, `interval_count`, `max_charges`, `charges_made`, `token`, `next_charge_at`, `trial_end`, `cancel_at_period_end`, `canceled_at`, `ended_at`, `created_at`, `customer { id, email }`, **`client_reference_id`**, **`metadata`**.

The object reflects the state **when the webhook is sent**. If a retry arrives hours later, it carries the state of that moment.

**Grant and remove access:** provide the service while the subscription is `active: true`. Remove it on `subscription.suspended`, `subscription.canceled`, `subscription.ended` or `mandate.revoked`. Restore it on `subscription.reactivated`. If your server was down, catch up with `bp.events.list({ starting_after })`.

## 3. Mobile apps (Flutter, iOS, Android)

![Inside an app](images/in-app.png)

The app **never** holds the `bp_…` key. The checkout opens in a **system sheet on top of your app**: SFSafariViewController on iOS, Custom Tabs on Android. Never a custom WebView: wallets do not open reliably from one.

1. In your app the customer taps "Subscribe". The app asks **your server** for a link (created with `client_reference_id`, `success_url: 'myapp://pay'` and `cancel_url: 'myapp://pay'`).
2. The checkout sheet opens on top of your app: amount, merchant, email + code, wallet choice.
3. The phone switches to the wallet (Trust, MetaMask, Binance…): the customer **approves the signature** and comes back. The wallet opens a second time for the **charge permission**. If the wallet does not open by itself, the sheet shows "Open <wallet>".
4. The sheet shows "Payment complete" and **"Back to <your app>"**: tapping it closes the sheet and the customer is back in your app.
5. Your server receives `checkout.completed` / `payment.succeeded` with its `client_reference_id` and grants the service.

```dart
import 'package:buclepay_checkout/buclepay_checkout.dart';

final checkout = BuclePayCheckout();
final url = await myServer.createPayment(planId);              // returns link.url
final r = await checkout.open(Uri.parse(url), returnScheme: 'myapp');
// r.status: completed | canceled | failed | dismissed
await myServer.paymentStatus(r.linkId);                        // your server (webhook) is the source of truth
```

Register the return scheme: iOS → `CFBundleURLTypes` with `myapp` in `Info.plist`; Android → an `intent-filter` with `<data android:scheme="myapp"/>` on the main activity (`launchMode="singleTop"`). Full app: [`sdk/flutter/example`](../sdk/flutter/example).

**Native iOS (Swift):** open the link with `SFSafariViewController` and handle `myapp://pay?bp_status=…` in `onOpenURL`. **Native Android (Kotlin):** open it with `CustomTabsIntent` and read the `intent.data` of the return. **React Native / Expo:** `expo-web-browser` (`openAuthSessionAsync(url, 'myapp://pay')`). In every case, confirm on your server before granting access.

Selling services that are used in person (gyms, classes, clinics) inside an app is fine. Digital content consumed inside the app may fall under the app stores' in-app purchase rules: check them for your case.

## 4. Web and web apps

![Checkout](images/checkout.png)

On a website, open `link.url` with a normal link or redirect. In a web app (SaaS), open it in a new tab or a popup and refresh the user's plan when your server gets the webhook.

![Inside a web app](images/web-app.png)

### The web button `<buclepay-button>`

Two lines on any page, no dependencies ([sdk/web](../sdk/web/README.md)):

```html
<script src="https://app.buclepay.com/js/v1.0.1/buclepay-button.js" integrity="sha384-ooi1+8YWECT2Oyw8PDYuriQWeY/ZduIS0eIfnhgdW3DVq56Oxn66tSwKigbSgnPF" crossorigin="anonymous" defer></script>

<buclepay-button link="https://app.buclepay.com/pay/plk_…" label="Subscribe"></buclepay-button>
```

![Buttons](images/buttons.png)

Copy the `<script>` tag exactly: `integrity` lets the visitor's browser refuse the file if it were ever altered, and the versioned URL never changes.

| Attribute | Values |
|---|---|
| `link` | the payment link (`…/pay/<id>`) or its id. Required |
| `label` | your own words: "Subscribe", "Pay 20 USD"… Default: "Subscribe" in the page language |
| `theme` | `dark` (default) · `light` (dark pages, next to another dark button) · `lime` |
| `target` | `_self` (default) · `_blank` |

A 56 px pill with your label and, small inside it, "with buclePay". No logos inside the button: your brand is already on your page. The button makes no network requests and sets no cookies.

The button only opens the payment page. **Grant access from the verified webhook**, never because someone clicked or came back to your page.

Building your own button instead? Use your own words and the "with buclePay" mark inside it, without logos.

## 5. bucleScore: reward your best customers

![bucleScore](images/buclescore.png)

Each payer has a bucleScore built from all their payments on buclePay. **You never see the score or the history.** You see their **level (1 to 4)** only if the customer chose to show it to you (an unchecked box in the checkout; they can remove it anytime in "My account"). Showing it to you never shows it to any other merchant.

With that you define **rewards** by level, and customers who share their level get the ones that apply:

| `kind` | `value` |
|---|---|
| `discount_pct` | 1 to 50 (%) |
| `free_period` | 1 to 3 (free charges) |
| `gift`, `priority`, `early_access`, `custom` | none; `title` says what it is |

Create and remove them from the dashboard (**Customers › Your rewards by level**) or with the API (below).

**Not allowed:** asking for deposits, offering extra installments or credit terms, denying the service or charging differently because of the level. A reward that looks like credit is rejected (`credit_like`). Up to 20 active rewards.

```js
await bp.perks.create({ min_level: 3, kind: 'discount_pct', value: 10, title: '10% off your renewal' });
const { data } = await bp.customers.perks('cus_…');
// { object: 'customer_perks', level_shared: true, level: 4, perks: [ … ] }
// without permission: { level_shared: false, level: null, perks: [] }
```

> The level is for rewards only. Do not use it to deny service, ask for deposits, offer credit or charge differently.

## 6. API reference

Base URL `https://app.buclepay.com`. Header `Authorization: Bearer bp_…`. JSON in and out.

```bash
curl -X POST https://app.buclepay.com/api/v1/payment_links \
  -H "Authorization: Bearer $BUCLEPAY_API_KEY" -H "Content-Type: application/json" \
  -d '{"amount_usd":49.99,"interval":"month","client_reference_id":"user_123","metadata":{"plan":"pro"}}'
```

| Method | Path | What for | SDK |
|---|---|---|---|
| `POST` | `/api/v1/payment_links` | Create a link | `paymentLinks.create` |
| `GET` | `/api/v1/payment_links/{id}` · `?client_reference_id=` | Link status: `completed`, `subscription_id` | `paymentLinks.retrieve` / `list` |
| `GET` | `/api/v1/subscriptions` · `/{id}` | Filters `client_reference_id`, `email`, `status` | `subscriptions.list` / `retrieve` |
| `GET` | `/api/v1/plans` | Your plans (for `plan_id`) | `plans.list` |
| `GET` | `/api/v1/events` | Same events as webhooks: `type`, `starting_after`, `limit` (max 100) | `events.list` |
| `GET` | `/api/v1/customers` · `/payments` | Customers (with `level` only if shared) and payments | `customers.list` / `payments.list` |
| `GET` `POST` | `/api/v1/perks` | bucleScore rewards | `perks.list` / `create` |
| `GET` | `/api/v1/customers/{id}/perks` | Customer's level (if shared) and rewards | `customers.perks` |

**Errors:** `{ "error": { "code": "amount_too_small", "message": "…", "param": "amount_usd" } }` with HTTP 400, 401, 404, 429, 500 or 503. Codes: `unauthorized` (missing or invalid key), `not_found`, `invalid_metadata`, `invalid_client_reference_id`, `invalid_description`, `invalid_success_url`, `invalid_cancel_url`, `amount_too_small`, `invalid_amount_usd`, `invalid_interval`, `invalid_max_charges`, `invalid_trial_days`, `interval_required`, `invalid_expires_in_days`, `invalid_plan_id`, `plan_not_found`, `plan_archived`, `plan_id_conflict`, `invalid_starting_after`, `service_off`, `email_not_supported`, `rate_limited`, `internal`; rewards: `credit_like`, `kind_not_allowed`, `value_out_of_range`, `invalid_level`, `invalid_title`, `too_many`. The SDK throws them as `BuclePayError` with `status`, `code` and `param`.

**Limits:** link creation is rate-limited per account (per minute and per day); a `429` comes with `retry-after`.

## 7. Testing

- **Dashboard › Developers › Webhooks › Send test** delivers a signed `test.ping` through the same path as real events. Use it to check your endpoint and your signature verification.
- Run one real payment of the minimum amount (1.99 USD) end to end, cancel it from "My account", and check that your server grants and then removes access.

## 8. Security rules

These are the rules an integration must follow. They are short on purpose.

1. **The API key (`bp_…`) and the webhook secret (`whsec_…`) live only on your server.** Never in an app, a web page, a repository or a log.
2. **Verify every webhook** with `constructEvent` on the **raw** body. Reply 400 and do nothing if it fails.
3. **Process each `event.id` once.** Events can arrive more than once.
4. **Grant access only from your server** (webhook or API), never from the app's or the browser's return URL.
5. **No personal data in `metadata` or `client_reference_id`.** Use your internal ids.
6. **Never ask the customer for a seed phrase or private key.** buclePay never does either.
7. **Use the bucleScore level only for rewards.**
8. **Keep the SDK updated** and report vulnerabilities privately (see [SECURITY.md](../SECURITY.md)).

## 9. Platforms (coming soon)

Coming soon: if your software installs buclePay for many merchants, you will be able to earn your own commission on each charge, up to 5% (a cap written in the contract). Each merchant signs it from their own wallet. You can lower it at any time; raising it needs a new signature from the merchant. Both commissions are split in the same transaction as the charge. Contact hello@buclepay.com to join the waitlist.
