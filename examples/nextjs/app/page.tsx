import { PayButton } from '@/components/PayButton';

export default function Page() {
  return (
    <main style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h1>Pro plan</h1>
      <p>9.99 USD · same date every month · pay with USDT or USDC</p>
      <PayButton label="Subscribe" />
    </main>
  );
}
