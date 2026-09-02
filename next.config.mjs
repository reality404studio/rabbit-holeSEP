import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  /* Next 15 에서 experimental.serverComponentsExternalPackages 가
     최상위 serverExternalPackages 로 승격됐다.
     @anthropic-ai/sdk 를 번들에서 빼는 이유는 그대로다 — 웹팩이 SDK 의
     안 쓰는 zod 헬퍼를 분석하는데 그게 zod v4 를 요구하고 우리는 v3 다. */
  serverExternalPackages: ["@anthropic-ai/sdk"],
};

/* `next dev` 에서도 Cloudflare 바인딩(KV)을 붙여준다.
   이게 없으면 로컬은 src/lib/kv.ts 의 메모리 폴백으로 떨어진다. */
initOpenNextCloudflareForDev();

export default nextConfig;
