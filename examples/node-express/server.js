// buclePay with Node + Express.
// POST /pay      → creates a payment link for the signed-in user and returns { url }
// POST /webhooks/buclepay → verifies the signature and grants or removes access
// GET  /rewards  → the signed-in user's bucleScore rewards (only if they chose to share their level with you)
// Replace the in-memory maps with your database.
import express from 'express';
import { BuclePay } from '@buclepay/node';

export function createApp({ bp = new BuclePay(process.env.BUCLEPAY_API_KEY), whsec = process.env.BUCLEPAY_WHSEC, publicUrl = process.env.PUBLIC_URL } = {}) {
  const app = express();
  const access = new Map();          // userId → true while the subscription is active (use your DB)
  const processed = new Set();       // event ids already handled (use your DB, with a unique index)
  const customers = new Map();       // userId → buclePay customer id (cus_…), saved from the webhook (use your DB)

  // Your own auth goes here. This demo reads the user id from a header.
  const currentUser = (req) => req.get('x-user-id');

  app.post('/pay', express.json(), async (req, res) => {
    const userId = currentUser(req);
    if (!userId) return res.status(401).json({ error: 'sign in first' });
    try {
      const { data: link } = await bp.paymentLinks.create({
        amount_usd: 9.99,
        interval: 'month',
        description: 'Pro plan',
        client_reference_id: userId,          // your id, never an email
        metadata: { plan: 'pro' },
        success_url: `${publicUrl}/billing?done=1`,
        cancel_url: `${publicUrl}/billing`,
      });
      res.json({ url: link.url });
    } catch (e) {
      res.status(e.status === 400 ? 400 : 502).json({ error: e.code ?? 'payment_unavailable' });
    }
  });

  // RAW text body: the signature is computed over the exact bytes buclePay sent.
  app.post('/webhooks/buclepay', express.text({ type: '*/*' }), (req, res) => {
    let event;
    try {
      event = bp.webhooks.constructEvent(req.body, req.get('buclepay-signature'), whsec);
    } catch {
      return res.sendStatus(400);
    }
    if (processed.has(event.id)) return res.sendStatus(200);
    processed.add(event.id);

    const obj = event.data?.object;
    switch (event.type) {
      case 'payment.succeeded':
        access.set(obj.subscription.client_reference_id, true);
        if (obj.subscription.customer?.id) customers.set(obj.subscription.client_reference_id, obj.subscription.customer.id);
        break;
      case 'subscription.reactivated':
        access.set(obj.client_reference_id, true);
        break;
      case 'subscription.suspended':
      case 'subscription.canceled':
      case 'subscription.ended':
      case 'mandate.revoked':
        access.delete(obj.client_reference_id);
        break;
    }
    res.sendStatus(200);
  });

  // bucleScore: rewards only. Never deny service, ask for deposits, offer credit or change prices by level.
  app.get('/rewards', async (req, res) => {
    const customerId = customers.get(currentUser(req));
    if (!customerId) return res.json({ level_shared: false, level: null, perks: [] });
    try {
      const { data } = await bp.customers.perks(customerId);
      res.json({ level_shared: data.level_shared, level: data.level, perks: data.perks });
    } catch {
      res.json({ level_shared: false, level: null, perks: [] }); // rewards are a bonus: never block the user over them
    }
  });

  app.get('/me', (req, res) => res.json({ pro: access.get(currentUser(req)) === true }));
  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 3000);
  createApp().listen(port, () => console.log(`listening on http://localhost:${port}`));
}
