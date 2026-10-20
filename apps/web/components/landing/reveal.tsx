"use client";
import { useEffect, useRef } from "react";

/** Fades content up when it scrolls into view. Content is visible without JS and for reduced-motion users. */
export function Reveal({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
    el.classList.add("lp-hidden");
    const io = new IntersectionObserver(([e]) => {
      if (e?.isIntersecting) { el.style.transitionDelay = `${delay}ms`; el.classList.remove("lp-hidden"); io.disconnect(); }
    }, { rootMargin: "0px 0px -8% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [delay]);
  return <div ref={ref} className={`lp-reveal ${className}`}>{children}</div>;
}
