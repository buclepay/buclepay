'use client';
// The button only asks YOUR server for a link and opens it. No key, no amount decided in the browser.
// Text in your words ("Subscribe"), with the "with buclePay" mark inside. Add your logo inside only if it is not already above.
import { useState } from 'react';

export function PayButton({ label = 'Subscribe' }: { label?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function pay() {
    setBusy(true); setError(null);
    const r = await fetch('/api/buclepay/checkout', { method: 'POST' }).catch(() => null);
    const j = r ? await r.json().catch(() => null) : null;
    if (!r?.ok || !j?.url) { setBusy(false); setError('Could not start the payment. Try again.'); return; }
    window.location.assign(j.url); // the page comes back to your success_url; access is granted by the webhook
  }
  return (
    <div>
      <button onClick={pay} disabled={busy} style={{ height: 56, width: '100%', border: 0, borderRadius: 999, background: '#111', color: '#fff',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, font: 'inherit', fontWeight: 600, cursor: 'pointer' }}>
        <span>{busy ? 'Opening…' : label}</span>
        <span style={{ fontSize: 10.5, fontWeight: 500, color: '#9A9AA2' }}>with <b style={{ color: '#fff' }}>bucle</b><b style={{ color: '#B5E300' }}>Pay</b></span>
      </button>
      {error && <p role="alert" style={{ color: '#C8102E', fontSize: 14 }}>{error}</p>}
    </div>
  );
}
