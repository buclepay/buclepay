# AGENTS.md — integrating buclePay with an AI coding assistant

This file is for AI coding agents (Claude, Codex, Cursor, Copilot…) asked to add buclePay payments to a project. Follow it literally. Full guide: [docs/INTEGRATION.md](docs/INTEGRATION.md).

## What buclePay is, in one paragraph

Recurring and one-time payments in USDT/USDC without custody. The project's **server** creates a payment link with the buclePay API, the **customer** opens it and signs once in their own wallet, and buclePay calls the server's **webhook** for every payment. Money goes from the customer's wallet to the merchant's wallet on-chain; buclePay never holds it.

## Hard rules (never break these)

1. The API key `bp_…` and the webhook secret `whsec_…` go **only** in server environment variables (`BUCLEPAY_API_KEY`, `BUCLEPAY_WHSEC`). Never in client code, mobile apps, `NEXT_PUBLIC_*`, `VITE_*`, `EXPO_PUBLIC_*`, source control or logs.
2. Grant or remove access **only** from the verified webhook (or a server-side API call). Never from the browser redirect or the app's return URL: those are for the UI.
3. Verify every webhook with `bp.webhooks.constructEvent(rawBody, signatureHeader, secret)` on the **raw text body**. Disable JSON body parsing for that route. On failure, reply 400 and do nothing.
4. Store processed `event.id`s and skip duplicates. Reply 2xx quickly.
5. `client_reference_id` = the project's own user or order id. No emails, names or other personal data in `client_reference_id` or `metadata`.
6. On mobile, open the checkout with the system sheet (Flutter `buclepay_checkout`, SFSafariViewController, Custom Tabs, `expo-web-browser`). Never inside a custom WebView.
7. Never ask users for a seed phrase or private key, and never write code that handles one.
8. The bucleScore level is for rewards only. Never write logic that denies service, asks for deposits, offers credit or changes prices based on it.

## Recipe

1. **Ask the user** for: the price(s) and frequency, what "access" means in their app (a flag, a role, a plan field), and their success/cancel URLs or app scheme. Do not invent prices.
2. **Install** on the server: `npm i @buclepay/node` (Node ≥ 18, no dependencies). Other languages: plain HTTPS, see the API table in the guide.
3. **Add env vars** `BUCLEPAY_API_KEY` and `BUCLEPAY_WHSEC` to the server's secret store and to `.env.example` (empty values). The user creates them in the buclePay dashboard › Developers.
4. **Create-payment endpoint** (authenticated): it creates a link with `client_reference_id` = the current user's id and returns `{ url }`. Create the link when the user taps "pay", not in advance.
5. **Webhook endpoint** (public, raw body): verify, dedupe, then:
   - `payment.succeeded` → grant access to `event.data.object.subscription.client_reference_id`.
   - `subscription.suspended`, `subscription.canceled`, `subscription.ended`, `mandate.revoked` → remove access for `event.data.object.client_reference_id`.
   - `subscription.reactivated` → grant again.
   - A subscription with `active: true` means "provide the service".
6. **Client**: a button that calls the create-payment endpoint and opens `url` (web: same tab or new tab; mobile: system sheet). Button text in the merchant's words ("Subscribe"), with the "with buclePay" mark.
   - On a website with a fixed plan link, use the web button instead of building one: `<script src="https://app.buclepay.com/js/v1.0.1/buclepay-button.js" integrity="sha384-ooi1+8YWECT2Oyw8PDYuriQWeY/ZduIS0eIfnhgdW3DVq56Oxn66tSwKigbSgnPF" crossorigin="anonymous" defer></script>` and `<buclepay-button link="<payment link url>" label="Subscribe"></buclepay-button>`. Copy the script tag exactly, with its `integrity` and `crossorigin` attributes (current tag in [sdk/web/integrity.json](sdk/web/integrity.json)). Never put an API key in the page: the button only needs the public link. See [sdk/web](sdk/web/README.md).
7. **bucleScore rewards (optional, ask the user first):** save `event.data.object.subscription.customer.id` from `payment.succeeded` next to your user. Create rewards once with `bp.perks.create({ min_level, kind, value, title })` (`kind`: `discount_pct` 1–50, `free_period` 1–3, or `gift`/`priority`/`early_access`/`custom`), or let the merchant create them in the dashboard › Customers. Show a user their rewards with `bp.customers.perks(customerId)`: `level_shared: false` means show nothing special, never an error. Never read or store a numeric score: the API only gives the level, and only with the customer's permission.
8. **Tell the user** what they must do by hand: create the API key, register the webhook URL and events in the dashboard, and run one real payment of 1.99 USD to test.

## Templates

Copy from [`examples/`](examples):

| Stack | Folder |
|---|---|
| Node + Express (with bucleScore rewards) | [`examples/node-express`](examples/node-express) |
| Next.js (App Router, with bucleScore rewards) | [`examples/nextjs`](examples/nextjs) |
| Flutter | [`sdk/flutter/example`](sdk/flutter/example) |
| Any website (button) | [`sdk/web`](sdk/web/README.md) |

## Facts you may need

- Minimum amount 1.99 USD. Intervals: `day` (1–365), `week` (1–2), `month` (1 or 3), `year` (1). Installments: `max_charges` 2–120. Trial: `trial_days` 0–90.
- Webhook header: `buclepay-signature: t=<unix>,v1=<hex hmac_sha256(secret, "<t>.<raw body>")>`, valid 5 minutes. Retries: 1 min, 5 min, 30 min, 2 h, 6 h, 1 day.
- Errors: `{ error: { code, message, param } }`; the SDK throws `BuclePayError` with `status`, `code`, `param`.
- Catch up after downtime: `bp.events.list({ starting_after })`.
- SDK install: `npm i @buclepay/node`. Types: [sdk/node/index.d.ts](sdk/node/index.d.ts). The SDK is one file with no dependencies.
- bucleScore levels: 1 Spark · 2 Glow · 3 Shine · 4 Star (`level` + `level_name`, shared by the customer per merchant). Show the name to users, store the number. Reward errors: `credit_like`, `kind_not_allowed`, `value_out_of_range`, `invalid_level`, `invalid_title`, `too_many` (max 20 active).
- Networks: Polygon, BNB Chain, Arbitrum, Base (USDC only on Base). Tokens: USDT, USDC.
