// GET /api/buclepay/rewards → the signed-in user's bucleScore level and rewards, only if they chose to share their level with you.
// Rewards only: never deny service, ask for deposits, offer credit or change prices by level.
import { buclepay, currentUserId, db } from '@/lib/buclepay';

const NONE = { level_shared: false, level: null, level_name: null, perks: [] };

export async function GET(req: Request) {
  const userId = await currentUserId(req);
  if (!userId) return Response.json({ error: 'sign in first' }, { status: 401 });
  const customerId = await db.customerId(userId);
  if (!customerId) return Response.json(NONE);
  try {
    const { data } = await buclepay().customers.perks(customerId);
    return Response.json({ level_shared: data.level_shared, level: data.level, level_name: data.level_name, perks: data.perks });
  } catch {
    return Response.json(NONE); // rewards are a bonus: never block the user over them
  }
}
