import type { NextConfig } from 'next'

const config: NextConfig = {
  output: 'standalone',
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'crests.football-data.org' },
    ],
  },
}

export default config
