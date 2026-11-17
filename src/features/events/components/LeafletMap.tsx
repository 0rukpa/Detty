"use client";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import Link from "next/link";
import { useEffect } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import type { MapProps } from "./EventMap";

const NIGERIA_CENTRE: [number, number] = [9.08, 8.68];

// Custom pins: Leaflet's default marker images don't survive bundling, and these match the brand.
const pinIcon = (certified: boolean) =>
  L.divIcon({
    className: "",
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -12],
    html: `<span style="display:block;width:26px;height:26px;border-radius:9999px;border:3px solid #fff;box-shadow:0 2px 10px rgba(0,0,0,.5);background:${
      certified ? "conic-gradient(#ff2e93,#ff7a1a,#c6ff3d,#4d8dff,#8b3dff,#ff2e93)" : "#ff2e93"
    }"></span>`,
  });

function View({ pins, focus }: Pick<MapProps, "pins" | "focus">) {
  const map = useMap();
  useEffect(() => {
    if (focus) {
      map.setView([focus.lat, focus.lng], focus.zoom);
    } else if (pins.length > 0) {
      map.fitBounds(L.latLngBounds(pins.map((p) => [p.lat, p.lng])), { padding: [40, 40], maxZoom: 12 });
    } else {
      map.setView(NIGERIA_CENTRE, 6);
    }
  }, [map, pins, focus]);
  return null;
}

export default function LeafletMap({ pins, focus }: MapProps) {
  return (
    <MapContainer center={NIGERIA_CENTRE} zoom={6} scrollWheelZoom className="size-full" style={{ background: "#131119" }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <View pins={pins} focus={focus} />
      {pins.map((p) => (
        <Marker key={p.id} position={[p.lat, p.lng]} icon={pinIcon(p.certified)} title={p.title} alt={p.title}>
          <Popup>
            <Link href={`/e/${p.slug}`} style={{ color: "#08070b", fontWeight: 800, fontSize: 14 }}>
              {p.title}
            </Link>
            <br />
            <span style={{ color: "#444" }}>
              {p.when} · {p.price}
            </span>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
