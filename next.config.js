/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Typové chyby build zastaví (7. 10. 2026 opraveny všechny dosavadní).
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
  },
  headers: async () => [
    {
      source: '/(.*)',
      headers: [{ key: 'Cache-Control', value: 's-maxage=0, must-revalidate' }],
    },
  ],
}

module.exports = nextConfig