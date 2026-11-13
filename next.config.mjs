/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['pg', 'bcryptjs', 'web-push'],
  experimental: { serverActions: { bodySizeLimit: '2mb' } },
};
export default nextConfig;
