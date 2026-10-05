import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: {
    default: 'Égua, adota!',
    template: '%s · Égua, adota!',
  },
  description: 'Alertas de resgate de animais de rua em Belém.',
  openGraph: {
    siteName: 'Égua, adota!',
    locale: 'pt_BR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
  },
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="pt-BR">
      <body>
        <header className="site-header">
          <Link className="brand" href="/">
            Égua, adota!
          </Link>
          <nav className="header-links">
            <Link href="/mapa">Mapa</Link>
            <Link href="/?type=lost">Perdidos</Link>
            <Link href="/?type=help_request">Ajuda</Link>
            <Link href="/admin">Moderação</Link>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
