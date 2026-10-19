// The buclePay client lives only on the server: `server-only` makes the build fail if a client component imports it.
import 'server-only';
import { BuclePay } from '@buclepay/node';

// Created on first use, not at import: `next build` loads route files without your secrets.
let client: BuclePay | undefined;
export function buclepay(): BuclePay {
  return (client ??= new BuclePay(process.env.BUCLEPAY_API_KEY!));
}

// Replace with your auth (NextAuth, Clerk, Supabase…). Must return YOUR user id, never an email.
export async function currentUserId(req: Request): Promise<string | null> {
  return req.headers.get('x-user-id');
}

// Replace with your database. Keep processed event ids in a table with a unique index.
const processed = new Set<string>();
const customers = new Map<string, string>(); // your user id → buclePay customer id (cus_…), saved from the webhook
export const db = {
  async saveCustomer(userId: string, customerId: string) { customers.set(userId, customerId); },
  async customerId(userId: string) { return customers.get(userId) ?? null; },
  async alreadyProcessed(eventId: string) { if (processed.has(eventId)) return true; processed.add(eventId); return false; },
  async setPro(userId: string, pro: boolean) { console.log(`user ${userId} pro=${pro}`); },
};
