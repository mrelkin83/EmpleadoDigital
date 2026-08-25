import type { NextConfig } from 'next';

/** Proxy hacia la API para evitar CORS en desarrollo. */
const nextConfig: NextConfig = {
  experimental: {
    // Next.js corta el proxy de /api/* a los 30s por defecto en dev; la
    // generación de video (económico o Veo) y carruseles supera eso.
    proxyTimeout: 300_000,
  },
  async rewrites() {
    const apiBase = process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';
    return [
      { source: '/api/:path*', destination: `${apiBase}/api/:path*` },
      { source: '/health', destination: `${apiBase}/health` },
      { source: '/auth/:path*', destination: `${apiBase}/auth/:path*` },
      { source: '/media/:path*', destination: `${apiBase}/media/:path*` },
    ];
  },
};

export default nextConfig;
