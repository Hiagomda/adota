import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Baloo_2, Nunito } from 'next/font/google';
import './globals.css';

const display = Baloo_2({ subsets: ['latin'], variable: '--font-display' });
const body = Nunito({ subsets: ['latin'], variable: '--font-body' });

export const metadata: Metadata = {
  title: 'Painel · Égua, adota!',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
