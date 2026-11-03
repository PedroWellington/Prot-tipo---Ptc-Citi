"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

// Leaflet (e os blocos do mapa) só baixam quando a seção Unidades chega perto da tela
const UnitMap = dynamic(() => import("../unit-map"), { ssr: false, loading: () => <div className="skeleton h-64 w-full sm:h-80" /> });

export function LazyMap({ units }: { units: { id: string; name: string; lat: number; lng: number }[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setShow(true); io.disconnect(); } }, { rootMargin: "300px" });
    if (box.current) io.observe(box.current);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={box} className="card h-64 overflow-hidden sm:h-80">
      {show ? <UnitMap units={units} me={null} /> : <div className="skeleton h-full w-full" />}
    </div>
  );
}
