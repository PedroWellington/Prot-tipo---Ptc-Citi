"use client";

import { useEffect, useRef } from "react";

/** Barra fina no topo: scroll-driven animation no CSS; listener passivo só onde não há suporte. */
export function ScrollProgress() {
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (CSS.supports("animation-timeline: scroll()")) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const root = document.documentElement;
      const range = root.scrollHeight - root.clientHeight;
      if (bar.current) bar.current.style.transform = `scaleX(${range > 0 ? root.scrollTop / range : 0})`;
    };
    const onScroll = () => { frame ||= requestAnimationFrame(update); };
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onScroll, { passive: true });
    return () => {
      removeEventListener("scroll", onScroll);
      removeEventListener("resize", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);
  return <div ref={bar} aria-hidden className="scroll-bar" />;
}
