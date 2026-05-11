/** @type {import("next").NextConfig} */

const config = {
  output: 'standalone',
  serverExternalPackages: ['better-sqlite3', '@prisma/adapter-better-sqlite3'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'crests.football-data.org' },
    ],
  },
}

export default config
