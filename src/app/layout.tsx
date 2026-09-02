import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Rabbit Hole — 질문에서 시작하는 스탠퍼드 철학백과사전",
  description:
    "당신의 질문이 어떤 SEP 항목과 연결되는지 조판합니다. 본문은 이 지면에 인쇄되지 않습니다.",
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
        {/*
          DESIGN-SYSTEM.md §5 — 서체는 발화 주체 표시다.
          · Nanum Myeongjo  한글 (읽는 목소리)
          · Old Standard TT 라틴 (제도의 목소리 · SEP 항목 원제)
          · JetBrains Mono  기계 문자열 (URL·번호)
          Nanum Myeongjo 를 고른 이유: Old Standard TT 가 세로 스트레스·고대비
          Didone 계열이라 같은 계열로 맞춘 것. 이전의 Hahmlet(저대비 슬랩)은
          한 지면에서 두 활자가 다른 시대를 말하게 만들었다.
        */}
        <link
          href="https://fonts.googleapis.com/css2?family=Nanum+Myeongjo:wght@400;700;800&family=Old+Standard+TT:ital,wght@0,400;0,700;1,400&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
