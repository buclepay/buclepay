import 'package:buclepay_checkout/buclepay_checkout.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('only accepts https links', () async {
    expect(() => BuclePayCheckout().open(Uri.parse('http://app.buclepay.com/pay/abc'), returnScheme: 'demo'), throwsArgumentError);
  });
  test('the result prints in a readable form', () {
    expect(const BuclePayResult(status: BuclePayStatus.completed, linkId: 'L', subscriptionId: 'S').toString(), contains('completed'));
  });
}
