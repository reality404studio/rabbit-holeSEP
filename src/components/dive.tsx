"use client";

import { useEffect } from "react";

/* ═══ 하강 레이어 ═══ 스크롤 진행이 곧 잠긴 깊이다.
   globals.css 의 --depth 를 쓰는 쪽은 .dive 의 clip-path 와 .gauge 의 scaleY 다.

   이전에는 이 effect 가 page.tsx 안에만 있었다. 그래서 보관소 페이지들은
   <Dive /> 마크업만 있고 --depth 가 영원히 0 이었다 — 하강이 죽어 있었다.
   지면 전체가 같은 장치를 쓰도록 컴포넌트가 자기 계측을 데리고 다닌다. */
export function Dive() {
  useEffect(() => {
    let ticking = false;
    const measure = () => {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      const d = h > 0 ? Math.min(1, Math.max(0, window.scrollY / h)) : 0;
      document.documentElement.style.setProperty("--depth", d.toFixed(4));
      ticking = false;
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(measure);
      }
    };
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <>
      <div className="dive" aria-hidden="true" />
      <div className="gauge" aria-hidden="true" />
    </>
  );
}
