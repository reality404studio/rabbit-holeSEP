import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/* 기본 설정 그대로 — 캐시 오버라이드를 쓰지 않는다.
   이 앱의 동적 라우트는 전부 force-dynamic 이고, 상태는 KV 로 직접 간다. */
export default defineCloudflareConfig();
