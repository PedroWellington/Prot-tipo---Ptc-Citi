"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

type Point = { lat: number; lng: number };

const pin = (color: string, size: number) =>
  L.divIcon({
    className: "",
    html: `<span style="display:block;width:${size}px;height:${size}px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 1px 6px rgb(0 0 0 / .4)"></span>`,
    iconSize: [size, size],
  });

/** Carregado sob demanda: Leaflet fica fora do bundle das outras telas. */
export default function UnitMap({ units, me }: { units: (Point & { id: string; name: string })[]; me: Point | null }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const meMarker = useRef<L.Marker | null>(null);

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { scrollWheelZoom: false, attributionControl: true });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap", maxZoom: 18 }).addTo(m);
    for (const u of units) L.marker([u.lat, u.lng], { icon: pin("#0f6b46", 20), title: u.name, alt: u.name }).addTo(m).bindPopup(u.name);
    m.fitBounds(L.latLngBounds(units.map((u) => [u.lat, u.lng])).pad(0.3));
    map.current = m;
    return () => { m.remove(); map.current = null; meMarker.current = null; };
  }, [units]);

  useEffect(() => {
    const m = map.current;
    if (!m || !me) return;
    meMarker.current?.remove();
    meMarker.current = L.marker([me.lat, me.lng], { icon: pin("#4a6fd4", 16), title: "Você", alt: "Sua localização" }).addTo(m);
    m.fitBounds(L.latLngBounds([...units.map((u): [number, number] => [u.lat, u.lng]), [me.lat, me.lng]]).pad(0.2));
  }, [me, units]);

  return <div ref={el} className="h-64 w-full sm:h-80" role="application" aria-label="Mapa das unidades" />;
}
