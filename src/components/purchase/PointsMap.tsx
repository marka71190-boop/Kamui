"use client";

import { useEffect, useRef } from "react";
import type { CircleMarker, Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";
import styles from "./Cdek.module.css";

export interface MapPoint {
  code: string;
  address: string;
  lat: number;
  lon: number;
}

const STYLE = {
  idle: { radius: 7, color: "#fff", weight: 2, fillColor: "#1a8f3c", fillOpacity: 1 },
  active: { radius: 11, color: "#fff", weight: 3, fillColor: "#e3161b", fillOpacity: 1 },
};

/**
 * Карта пунктов выдачи (Leaflet + OpenStreetMap, без ключей). Точки рисуются на canvas —
 * тысячи пунктов Москвы не тормозят. Нажатие на точку — onPick.
 */
export function PointsMap({
  points,
  activeCode,
  user,
  onPick,
}: {
  points: MapPoint[];
  /** Выбранный (или просматриваемый) пункт — выделен красным */
  activeCode?: string;
  /** Где находится покупатель (кнопка «Рядом со мной») */
  user?: { lat: number; lon: number } | null;
  onPick: (code: string) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const markers = useRef(new Map<string, CircleMarker>());
  const lib = useRef<typeof import("leaflet") | null>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const state = useRef({ points, activeCode, user });
  state.current = { points, activeCode, user };
  const userLayer = useRef<CircleMarker | null>(null);

  const draw = () => {
    const L = lib.current;
    const m = map.current;
    if (!L || !m) return;
    const { points, activeCode, user } = state.current;
    for (const mk of markers.current.values()) mk.remove();
    markers.current.clear();
    for (const p of points) {
      const mk = L.circleMarker([p.lat, p.lon], p.code === activeCode ? STYLE.active : STYLE.idle)
        .addTo(m)
        .bindTooltip(p.address, { direction: "top", offset: [0, -8] })
        .on("click", () => onPickRef.current(p.code));
      markers.current.set(p.code, mk);
    }
    userLayer.current?.remove();
    userLayer.current = user
      ? L.circleMarker([user.lat, user.lon], { radius: 8, color: "#fff", weight: 3, fillColor: "#2b7cff", fillOpacity: 1, interactive: false }).addTo(m)
      : null;
    const active = points.find((p) => p.code === activeCode);
    if (active) m.setView([active.lat, active.lon], Math.max(m.getZoom() || 0, 14));
    else if (user && points.some((p) => Math.abs(p.lat - user.lat) < 0.5 && Math.abs(p.lon - user.lon) < 0.8)) m.setView([user.lat, user.lon], 14);
    else if (points.length) m.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lon] as [number, number])), { padding: [24, 24], maxZoom: 15 });
  };

  // Карта создаётся один раз; библиотека подгружается только когда карту открыли
  useEffect(() => {
    let dead = false;
    void import("leaflet").then((L) => {
      if (dead || !box.current) return;
      lib.current = L;
      const m = L.map(box.current, { preferCanvas: true, scrollWheelZoom: false, attributionControl: true });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
      }).addTo(m);
      // колесо мыши прокручивает страницу, а не карту — пока по карте не нажали
      m.on("click", () => m.scrollWheelZoom.enable());
      map.current = m;
      draw();
    });
    return () => {
      dead = true;
      map.current?.remove();
      map.current = null;
      markers.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Новый набор пунктов (другой город, поиск) или местоположение — перерисовать
  useEffect(() => {
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, user]);

  // Сменился выбранный пункт — только перекрасить
  useEffect(() => {
    for (const [code, mk] of markers.current) {
      mk.setStyle(code === activeCode ? STYLE.active : STYLE.idle);
      mk.setRadius((code === activeCode ? STYLE.active : STYLE.idle).radius);
      if (code === activeCode) mk.bringToFront();
    }
  }, [activeCode]);

  return <div ref={box} className={styles.map} role="application" aria-label="Карта пунктов выдачи СДЭК" />;
}
