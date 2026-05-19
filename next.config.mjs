/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Keep @anthropic-ai/sdk as an external Node module — don't bundle.
    // Avoids webpack analyzing the SDK's unused zod helper, which requires zod v4
    // while we have v3 installed.
    serverComponentsExternalPackages: ["@anthropic-ai/sdk"],
  },
};

export default nextConfig;
