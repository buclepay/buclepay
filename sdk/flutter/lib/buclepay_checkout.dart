/// buclePay in a Flutter app: the checkout opens in a system sheet ON TOP of your app (SFSafariViewController on
/// iOS, Custom Tabs on Android). The customer signs in their wallet (another app), comes back, and taps "Back to …":
/// the page opens your `success_url` (your own scheme, e.g. `myapp://pay`), this class receives it, closes the sheet
/// and returns the result.
///
/// IMPORTANT: the result is for the UI only. The payment is confirmed on YOUR server (webhook `payment.succeeded`
/// or `checkout.completed`, or `GET /api/v1/payment_links/{id}`). Never grant access based only on this class.
library;

import 'dart:async';

import 'package:app_links/app_links.dart';
import 'package:url_launcher/url_launcher.dart';

/// How the payment ended according to the page (`bp_status`). `dismissed` = the customer closed the sheet without
/// finishing (or did not come back before the timeout): ask your server whether the link was paid.
enum BuclePayStatus { completed, canceled, failed, dismissed }

class BuclePayResult {
  const BuclePayResult({required this.status, this.linkId, this.subscriptionId, this.returnUri});
  final BuclePayStatus status;
  final String? linkId;
  final String? subscriptionId;
  final Uri? returnUri;

  @override
  String toString() => 'BuclePayResult($status, link: $linkId, subscription: $subscriptionId)';
}

class BuclePayCheckout {
  BuclePayCheckout({AppLinks? appLinks}) : _links = appLinks ?? AppLinks();

  final AppLinks _links;

  /// Opens [checkoutUrl] (the `url` of the link your server created) and waits for the return to [returnScheme]
  /// (the scheme of your `success_url` / `cancel_url`, without `://`).
  ///
  /// If nothing comes back within [timeout], returns `dismissed`. Call [cancel] if your screen closes first.
  Future<BuclePayResult> open(Uri checkoutUrl, {required String returnScheme, Duration timeout = const Duration(minutes: 30)}) async {
    if (checkoutUrl.scheme != 'https') throw ArgumentError('checkoutUrl debe ser https');
    final scheme = returnScheme.toLowerCase();
    final linkId = checkoutUrl.pathSegments.length >= 2 && checkoutUrl.pathSegments.first == 'pay' ? checkoutUrl.pathSegments[1] : null;
    _pending?.complete(const BuclePayResult(status: BuclePayStatus.dismissed));
    final done = _pending = Completer<BuclePayResult>();

    _sub?.cancel();
    _sub = _links.uriLinkStream.listen((uri) {
      if (uri.scheme.toLowerCase() != scheme || done.isCompleted) return;
      final q = uri.queryParameters;
      // another payment or another deep link of your app: not this payment's return
      if (linkId != null && q['bp_link'] != null && q['bp_link'] != linkId) return;
      done.complete(BuclePayResult(
        status: switch (q['bp_status']) {
          'completed' => BuclePayStatus.completed,
          'canceled' => BuclePayStatus.canceled,
          'failed' => BuclePayStatus.failed,
          _ => BuclePayStatus.dismissed,
        },
        linkId: q['bp_link'] ?? linkId,
        subscriptionId: q['bp_subscription'],
        returnUri: uri,
      ));
    });

    final opened = await launchUrl(checkoutUrl, mode: LaunchMode.inAppBrowserView);
    if (!opened) {
      // no in-app sheet available (rare): regular browser; the return still arrives through the deep link
      await launchUrl(checkoutUrl, mode: LaunchMode.externalApplication);
    }

    final result = await done.future.timeout(timeout, onTimeout: () => BuclePayResult(status: BuclePayStatus.dismissed, linkId: linkId));
    await _sub?.cancel();
    _sub = null;
    // close the checkout sheet (iOS; on Android the app is already in front)
    try { await closeInAppWebView(); } catch (_) {}
    return result;
  }

  /// Your screen closed: stop waiting (the result becomes `dismissed`).
  void cancel() {
    final p = _pending;
    if (p != null && !p.isCompleted) p.complete(const BuclePayResult(status: BuclePayStatus.dismissed));
  }

  Completer<BuclePayResult>? _pending;
  StreamSubscription<Uri>? _sub;
}
