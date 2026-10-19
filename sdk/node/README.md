# @buclepay/node

Official Node.js SDK for [buclePay](https://buclepay.com): recurring payments in stablecoins (USDT, USDC) without custody. No dependencies, Node 18+.

```bash
npm i @buclepay/node
```

Your API key (`bp_…`, Dashboard › Developers › API) lives **only on your server**, never in an app or a web page.

```js
import { BuclePay } from '@buclepay/node';
const bp = new BuclePay(process.env.BUCLEPAY_API_KEY);

// 1. Create a payment link with your own id, open link.url in your app or site
const { data: link } = await bp.paymentLinks.create({
  amount_usd: 49.99, interval: 'month', description: 'Pro plan',
  client_reference_id: 'user_123', metadata: { plan: 'pro' },
});

// 2. Receive the signed webhook and activate the service
app.post('/webhooks/buclepay', express.raw({ type: 'application/json' }), (req, res) => {
  const event = bp.webhooks.constructEvent(req.body.toString('utf8'), req.get('buclepay-signature'), process.env.BUCLEPAY_WHSEC);
  if (event.type === 'payment.succeeded') activate(event.data.object.subscription.client_reference_id);
  res.sendStatus(200);
});
```

| Method | What it does |
|---|---|
| `paymentLinks.create / retrieve / list` | Payment links (one-time, plan or installments) |
| `subscriptions.retrieve / list` | Filter by `client_reference_id`, `email`, `status` |
| `plans.list`, `customers.list`, `payments.list` | Your plans, customers and payments |
| `events.list` | Same events as the webhooks |
| `perks.list / create`, `customers.perks(id)` | bucleScore rewards (below) |
| `webhooks.constructEvent / verifySignature` | Verify the `buclepay-signature` header |

## bucleScore: reward your best customers

Each payer has a bucleScore built from all their payments on buclePay. **You never see the score or the history.** You see the customer's **level (1–4)** only if they chose to show it to you, and you use it to give rewards: discounts (1–50%), free charges (1–3), gifts, priority or early access.

```js
await bp.perks.create({ min_level: 3, kind: 'discount_pct', value: 10, title: '10% off your renewal' });
const { data } = await bp.customers.perks('cus_…'); // { level_shared, level, perks }
```

The level is for rewards only. Never use it to deny service, ask for deposits, offer credit or installments, or charge differently.

Errors are thrown as `BuclePayError` with `status`, `code` and `param`.

License: MIT.
