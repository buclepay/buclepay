# buclePay · Next.js (App Router)

- `lib/buclepay.ts`: the SDK client, marked `server-only` so it can never end up in the browser bundle.
- `app/api/buclepay/checkout/route.ts`: `POST` → `{ url }` of a payment link for the signed-in user.
- `app/api/buclepay/webhook/route.ts`: verifies the signature on `await req.text()`, skips duplicates, grants or removes access.
- `app/api/buclepay/rewards/route.ts`: `GET` → the user's bucleScore level and rewards, only if they chose to share their level (rewards only).
- `components/PayButton.tsx`: asks your server for the link and opens it.

```bash
cp .env.example .env.local   # BUCLEPAY_API_KEY, BUCLEPAY_WHSEC (never NEXT_PUBLIC_*)
npm install
npm run dev
```

In your own project: `npm i @buclepay/node server-only`, copy the five files, and replace `currentUserId()` and `db` with your auth and database. Webhook URL in the dashboard: `https://your-domain/api/buclepay/webhook`.
