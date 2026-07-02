import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'MBS Auto-Reply',
  description: 'Multi-tenant auto-commenting for Meta Business Suite',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
