// Minimal app to check on a real phone that the buclePay checkout works WITHOUT leaving the app:
// the checkout sheet opens on top, the wallet signs, and "Back to …" brings the customer back with the result.
//
// 1. On your server, create a payment link with success_url and cancel_url = buclepaydemo://pay
//    (see sdk/node or docs/INTEGRATION.md). The API key never goes in the app.
// 2. Paste the link here and tap "Pay with USDT / USDC".
import 'package:buclepay_checkout/buclepay_checkout.dart';
import 'package:flutter/material.dart';

void main() => runApp(const DemoApp());

class DemoApp extends StatelessWidget {
  const DemoApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'buclePay demo',
        theme: ThemeData(colorSchemeSeed: const Color(0xFFB5E300), useMaterial3: true),
        home: const PayScreen(),
      );
}

class PayScreen extends StatefulWidget {
  const PayScreen({super.key});
  @override
  State<PayScreen> createState() => _PayScreenState();
}

class _PayScreenState extends State<PayScreen> {
  final _url = TextEditingController();
  final _checkout = BuclePayCheckout();
  final _log = <String>[];
  bool _busy = false;

  Future<void> _pay() async {
    final uri = Uri.tryParse(_url.text.trim());
    if (uri == null || uri.scheme != 'https' || !uri.path.startsWith('/pay/')) {
      setState(() => _log.insert(0, 'Paste a https://app.buclepay.com/pay/… link'));
      return;
    }
    setState(() { _busy = true; _log.insert(0, '${_now()} opening the checkout sheet…'); });
    try {
      final r = await _checkout.open(uri, returnScheme: 'buclepaydemo');
      setState(() => _log.insert(0, '${_now()} returned: ${r.status.name} · link ${r.linkId} · subscription ${r.subscriptionId ?? '—'}'
          '${r.status == BuclePayStatus.completed ? '\n   (in a real app: confirm with your server before granting access)' : ''}'));
    } catch (e) {
      setState(() => _log.insert(0, '${_now()} error: $e'));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String _now() => TimeOfDay.now().format(context);

  @override
  void dispose() { _checkout.cancel(); _url.dispose(); super.dispose(); }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('buclePay checkout demo')),
        body: ListView(padding: const EdgeInsets.all(16), children: [
          const Text('This screen is "your app". The checkout opens on top and comes back here.'),
          const SizedBox(height: 12),
          TextField(controller: _url, decoration: const InputDecoration(labelText: 'Payment link', border: OutlineInputBorder()), keyboardType: TextInputType.url),
          const SizedBox(height: 12),
          FilledButton(onPressed: _busy ? null : _pay, child: Text(_busy ? 'Waiting for the payment…' : 'Pay with USDT / USDC')),
          const SizedBox(height: 24),
          for (final l in _log) Padding(padding: const EdgeInsets.only(bottom: 8), child: Text(l, style: const TextStyle(fontFamily: 'monospace', fontSize: 12))),
        ]),
      );
}
