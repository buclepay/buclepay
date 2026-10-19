# buclepay_checkout example

A minimal app that opens a buclePay payment link in a system sheet and comes back through `buclepaydemo://pay`.

1. On your server, create a link with the API (`success_url` and `cancel_url` = `buclepaydemo://pay`).
2. `flutter run`, paste the link and tap **Pay with USDT / USDC**.
3. Approve in your wallet; the sheet closes and the app shows the result.

The API key stays on your server. The app only opens the link.
