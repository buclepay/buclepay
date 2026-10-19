// POST /api/buclepay/checkout → { url } of a payment link for the signed-in user.
import { buclepay, currentUserId } from '@/lib/buclepay';

export async function POST(req: Request) {
  const userId = await currentUserId(req);
  if (!userId) return Response.json({ error: 'sign in first' }, { status: 401 });
  const base = process.env.PUBLIC_URL ?? new URL(req.url).origin;
  try {
    const { data: link } = await buclepay().paymentLinks.create({
      amount_usd: 9.99,
      interval: 'month',
      description: 'Pro plan',
      client_reference_id: userId,
      metadata: { plan: 'pro' },
      success_url: `${base}/billing?done=1`,
      cancel_url: `${base}/billing`,
    });
    return Response.json({ url: link.url });
  } catch (e) {
    const err = e as { status?: number; code?: string };
    return Response.json({ error: err.code ?? 'payment_unavailable' }, { status: err.status === 400 ? 400 : 502 });
  }
}
