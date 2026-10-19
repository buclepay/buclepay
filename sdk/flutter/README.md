# buclepay_checkout

Opens the [buclePay](https://buclepay.com) checkout in a system sheet on top of your Flutter app (SFSafariViewController on iOS, Custom Tabs on Android) and returns through a deep link. Never a custom WebView: wallets do not open reliably from one.

Your app **never** holds the API key. Your server creates the payment link (with `success_url` and `cancel_url` set to your scheme, e.g. `myapp://pay`) and the app only opens it.

## Install

```bash
flutter pub add buclepay_checkout
```

Or straight from GitHub:

```yaml
dependencies:
  buclepay_checkout:
    git: { url: https://github.com/buclepay/buclepay.git, path: sdk/flutter }
```

## Use

```dart
import 'package:buclepay_checkout/buclepay_checkout.dart';

final checkout = BuclePayCheckout();
final url = await myServer.createPayment(planId); // returns link.url
final r = await checkout.open(Uri.parse(url), returnScheme: 'myapp');
// r.status: completed | canceled | failed | dismissed
await myServer.paymentStatus(r.linkId); // your server (webhook) is the source of truth
```

Register the return scheme: iOS → `CFBundleURLTypes` with `myapp` in `Info.plist`; Android → an `intent-filter` with `<data android:scheme="myapp"/>` on the main activity (`launchMode="singleTop"`). See `example/`.

The signature always happens in the payer's wallet (Trust, MetaMask, Binance…), which is what keeps the payment non-custodial.

License: MIT.
