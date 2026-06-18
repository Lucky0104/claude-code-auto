/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Type errors fail the build; lint is run separately in CI to avoid blocking deploys.
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    // Prisma works best as an external package in server components.
    serverComponentsExternalPackages: ["@prisma/client", "prisma"],
  },
};

export default nextConfig;
