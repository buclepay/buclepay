export const metadata = { title: 'buclePay example' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body style={{ fontFamily: 'system-ui', maxWidth: 420, margin: '48px auto', padding: '0 16px' }}>{children}</body></html>;
}
