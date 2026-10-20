export class BuclePayError extends Error { status: number; code: string; param?: string }

export type Metadata = Record<string, string | number | boolean>;

export interface PaymentLinkParams {
  /** Amount in USD (minimum 1.99, cents allowed). Not sent with `plan_id`. */
  amount_usd?: number;
  /** With `interval` the link is a subscription; without it, a one-time payment. */
  interval?: 'day' | 'week' | 'month' | 'year';
  /** day: 1–365 · week: 1 or 2 · month: 1 or 3 · year: 1 */
  interval_count?: number;
  /** Installments: charging stops by itself after the last one is paid (2–120). */
  max_charges?: number;
  trial_days?: number;
  /** Subscribe to a plan created in the dashboard. */
  plan_id?: string;
  description?: string;
  /** Up to 20 pairs; keys of 1–40 characters (letters, digits, _ . -); values up to 500. No personal data. */
  metadata?: Metadata;
  /** Your own id (user, order…, up to 200 characters). Comes back in the API and in every webhook for that subscription. */
  client_reference_id?: string;
  /** 1–90; otherwise your Settings › Charges default (3 days). */
  expires_in_days?: number;
  /** Where the customer returns when done: a public https:// URL or your app scheme (myapp://pay). bp_link, bp_status and bp_subscription are appended. */
  success_url?: string;
  /** Same, for "Cancel and go back" or when the payment fails (bp_status=canceled|failed). */
  cancel_url?: string;
}

export interface PaymentLink {
  id: string; object: 'payment_link'; url: string; type: 'once' | 'plan' | 'invoice' | 'open'; status: 'active' | 'expired' | 'disabled';
  amount_usd: number; description: string | null; invoice_number: string | null; plan_id: string;
  interval: string | null; interval_count: number | null; max_charges: number | null; trial_days: number;
  expires_at: string | null; created_at: string; client_reference_id: string | null; metadata: Record<string, string>;
  /** true once the customer has signed; `subscription_id` then points to their subscription. */
  completed: boolean; subscription_id: string | null;
  success_url: string | null; cancel_url: string | null;
}

export interface Subscription {
  id: string; object: 'subscription'; status: 'trialing' | 'active' | 'grace' | 'suspended' | 'canceled' | 'ended' | 'paused';
  /** true = provide the service (paid up, in trial or in grace period). */
  active: boolean;
  plan: string; plan_id: string; amount_usd: number; interval: string; interval_count: number; max_charges: number | null; charges_made: number; token: 'USDT' | 'USDC' | null;
  next_charge_at: string | null; trial_end: string | null; cancel_at_period_end: boolean; canceled_at: string | null; ended_at: string | null; created_at: string;
  customer: { id: string; email: string | null }; label: string | null;
  client_reference_id: string | null; metadata: Record<string, string>;
}

export interface Invoice {
  id: string; object: 'invoice'; number: string; status: string; subscription_id: string;
  amount_usd: number; subtotal_usd: number; discount_usd: number; fee_usd: number; net_usd: number; fee_bps: number;
  period_start: string; period_end: string; due_at: string; paid_at: string | null;
  payment: { token: string | null; chain_id: number | null; chain: string | null; tx_hash: string; explorer_url: string | null } | null;
  subscription: Subscription | null;
}

export interface Plan {
  id: string; object: 'plan'; name: string; amount_usd: number; interval: string; interval_count: number; trial_days: number;
  max_charges: number | null; tokens: string[]; created_at: string; active_subscriptions: number;
}

export type EventType =
  | 'payment.succeeded' | 'payment.failed' | 'payment.retry_scheduled' | 'invoice.paid' | 'invoice.notice_undeliverable'
  | 'subscription.created' | 'subscription.past_due' | 'subscription.suspended' | 'subscription.reactivated' | 'subscription.canceled' | 'subscription.ended'
  | 'mandate.registered' | 'mandate.revoked' | 'merchant.restricted' | (string & {});

export interface BuclePayEvent {
  id: string; type: EventType; created: number; api_version: string;
  /** Event details (ids, reason…) plus `object`: the invoice (payment.*, invoice.*) or the subscription (subscription.*, mandate.*). */
  data: Record<string, unknown> & { object?: Invoice | Subscription };
}

export type PerkKind = 'discount_pct' | 'free_period' | 'gift' | 'priority' | 'early_access' | 'custom';
/** bucleScore levels: 1 Spark · 2 Glow · 3 Shine · 4 Star. */
export type LevelName = 'Spark' | 'Glow' | 'Shine' | 'Star';
export interface Perk { id: string; object: 'perk'; min_level: 1 | 2 | 3 | 4; min_level_name: LevelName; kind: PerkKind; value: number | null; title: string }
export interface PerkParams { min_level: 1 | 2 | 3 | 4; kind: PerkKind; /** discount_pct 1–50 · free_period 1–3 · the rest take no value */ value?: number; title: string }
export interface CustomerPerks { object: 'customer_perks'; customer: string; /** the customer agreed to show you their level */ level_shared: boolean; level: 1 | 2 | 3 | 4 | null; level_name: LevelName | null; perks: Perk[] }

export class BuclePay {
  constructor(apiKey: string, opts?: { baseUrl?: string; timeoutMs?: number; fetch?: typeof fetch });
  paymentLinks: {
    create(params: PaymentLinkParams): Promise<{ data: PaymentLink }>;
    retrieve(id: string): Promise<{ data: PaymentLink }>;
    list(params?: { client_reference_id?: string; limit?: number }): Promise<{ data: PaymentLink[] }>;
  };
  subscriptions: {
    retrieve(id: string): Promise<{ data: Subscription }>;
    list(params?: { client_reference_id?: string; email?: string; status?: string }): Promise<{ data: Subscription[] }>;
  };
  plans: { list(): Promise<{ data: Plan[] }> };
  customers: {
    list(): Promise<{ data: unknown[] }>;
    /** Level (only if the customer agreed to show it to you) and the rewards it unlocks. Never the score or the history. */
    perks(id: string): Promise<{ data: CustomerPerks }>;
  };
  /** Rewards by bucleScore level. Rewards only: never deposits, installments or credit terms. */
  perks: { list(): Promise<{ data: Perk[] }>; create(params: PerkParams): Promise<{ data: Perk }> };
  payments: { list(): Promise<{ data: unknown[] }> };
  events: { list(params?: { type?: string; starting_after?: string; limit?: number }): Promise<{ data: BuclePayEvent[]; has_more: boolean }> };
  webhooks: {
    constructEvent(body: string, signatureHeader: string, secret: string, opts?: { toleranceSeconds?: number; now?: number }): BuclePayEvent;
    verifySignature(body: string, signatureHeader: string, secret: string, opts?: { toleranceSeconds?: number; now?: number }): boolean;
  };
}

export function signPayload(secret: string, body: string, timestamp: number): string;
export function verifySignature(body: string, signatureHeader: string, secret: string, opts?: { toleranceSeconds?: number; now?: number }): boolean;
export function constructEvent(body: string, signatureHeader: string, secret: string, opts?: { toleranceSeconds?: number; now?: number }): BuclePayEvent;
