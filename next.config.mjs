/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  /* 정적 내보내기. 발행이 커밋이 된 뒤로 서버에서 할 일이 없다 —
     API 라우트도, KV 도, 시크릿도 없다. `next build` 가 out/ 을 뱉고
     Cloudflare Pages 는 그걸 그대로 올린다. */
  output: "export",

  /* 정적 호스팅에서 /archive/<id> 가 디렉터리 + index.html 로 떨어지게 한다.
     이게 없으면 확장자 없는 경로를 Pages 가 404 로 흘릴 수 있다. */
  trailingSlash: true,
};

export default nextConfig;
