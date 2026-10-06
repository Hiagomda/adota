import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Chrome } from '../components/chrome';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: {
    default: 'Égua, adota!',
    template: '%s · Égua, adota!',
  },
  description: 'Uma comunidade para ajudar animais de rua em Belém a encontrarem um lar.',
  openGraph: {
    siteName: 'Égua, adota!',
    locale: 'pt_BR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
  },
  icons: {
    icon: [
      { url: '/icon-light-32x32.png', media: '(prefers-color-scheme: light)' },
      { url: '/icon-dark-32x32.png', media: '(prefers-color-scheme: dark)' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: '/apple-icon.png',
  },
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="pt-BR">
      <body>
        <Suspense fallback={null}>
          <Chrome>{children}</Chrome>
        </Suspense>
      </body>
    </html>
  );
}
