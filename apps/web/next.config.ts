import type { NextConfig } from 'next';

// Cabeçalhos de segurança das páginas públicas. Sem CSP aqui: o mapa (MapLibre) busca estilos e
// tiles de fora e um CSP errado deixaria a página em branco.
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
  ...(process.env.NODE_ENV === 'production'
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000' }]
    : []),
];

const nextConfig: NextConfig = {
  allowedDevOrigins: ['127.0.0.1', '192.168.18.68'],
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
