import type { NextConfig } from 'next';

/** Proxy hacia la API para evitar CORS en desarrollo. */
const nextConfig: NextConfig = {
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
