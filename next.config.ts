import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    // Trip file uploads go through a server action; files are capped at 4 MB (lib/files.ts), under Vercel's 4.5 MB body limit.
    serverActions: { bodySizeLimit: '4.5mb' },
  },
};

export default nextConfig;
