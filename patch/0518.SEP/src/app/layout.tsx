import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SEP 토끼굴 — 질문에서 시작하는 스탠퍼드 철학백과사전",
  description:
    "당신의 질문이 어떤 SEP 항목과 연결되는지 안내합니다. 본문은 SEP에서 직접 읽으실 수 있습니다.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=JetBrains+Mono:wght@400;500&family=Noto+Serif+KR:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
