# buclePay · Node + Express

Two endpoints are all a server needs, plus an optional one for bucleScore rewards:

- `POST /pay` creates a payment link for the signed-in user and returns `{ url }`. Open it in the browser or the app.
- `POST /webhooks/buclepay` verifies the signature on the raw body, skips duplicates and grants or removes access.
- `GET /rewards` (optional) returns the user's bucleScore level and rewards, only if they chose to share their level with you.

```bash
cp .env.example .env      # fill BUCLEPAY_API_KEY and BUCLEPAY_WHSEC from the dashboard › Developers
npm install
npm test                  # runs without calling buclePay
npm start
```

In your own project install the SDK from npm (`npm i @buclepay/node`); here it points to `../../sdk/node`.

Replace the in-memory maps with your database and `currentUser()` with your auth. In the dashboard, point the webhook to `https://your-domain/webhooks/buclepay` with the events `payment.succeeded`, `subscription.*` and `mandate.revoked`.
