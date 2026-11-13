/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.LMS_BUILD_DIR || ".next",
  reactStrictMode: true,
  images: { remotePatterns: [{ protocol: "https", hostname: "**" }] },
  // Assignment submissions can include files up to 50MB each (200MB total);
  // the framework default (~1MB) would reject those before our own checks run.
  experimental: {
    serverActions: {
      bodySizeLimit: "200mb",
    },
  },
};
export default nextConfig;
