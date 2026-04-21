import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Cerna Trading — Intelligent Portfolio Analysis',
  description:
    'AI-powered trading intelligence for self-directed investors. Portfolio-aware analysis, value screening, and morning briefs powered by real-time data.',
  keywords: ['trading', 'portfolio', 'SMSF', 'stock analysis', 'value investing'],
  openGraph: {
    title: 'Cerna Trading',
    description: 'AI-powered trading intelligence for self-directed investors',
    type: 'website',
  },
  robots: {
    index: false,
    follow: false,
  },
  icons: {
    icon: '/icon.svg',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased bg-cerna-bg-primary text-cerna-text-primary">
        {children}
      </body>
    </html>
  );
}
