import { type Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'NEXUS.CHAT',
  description: 'Sci-Fi Intranet Chat System',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
