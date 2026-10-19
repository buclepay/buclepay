// POST /api/buclepay/webhook ← buclePay. Verifies the signature on the RAW body, skips duplicates, grants or removes access.
import { buclepay, db } from '@/lib/buclepay';

export async function POST(req: Request) {
  const raw = await req.text(); // never req.json(): the signature covers the exact bytes
  let event;
  try {
    event = buclepay().webhooks.constructEvent(raw, req.headers.get('buclepay-signature') ?? '', process.env.BUCLEPAY_WHSEC!);
  } catch {
    return new Response('bad signature', { status: 400 });
  }
  if (await db.alreadyProcessed(event.id)) return new Response('ok');

  const obj = event.data.object as { client_reference_id?: string | null; subscription?: { client_reference_id: string | null; customer?: { id: string } | null } | null } | undefined;
  switch (event.type) {
    case 'payment.succeeded':
      if (obj?.subscription?.client_reference_id) {
        await db.setPro(obj.subscription.client_reference_id, true);
        if (obj.subscription.customer?.id) await db.saveCustomer(obj.subscription.client_reference_id, obj.subscription.customer.id); // for bucleScore rewards
      }
      break;
    case 'subscription.reactivated':
      if (obj?.client_reference_id) await db.setPro(obj.client_reference_id, true);
      break;
    case 'subscription.suspended':
    case 'subscription.canceled':
    case 'subscription.ended':
    case 'mandate.revoked':
      if (obj?.client_reference_id) await db.setPro(obj.client_reference_id, false);
      break;
  }
  return new Response('ok');
}
