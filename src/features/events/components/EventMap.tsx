"use client";
import dynamic from "next/dynamic";

export type MapPin = {
  id: string;
  slug: string;
  title: string;
  lat: number;
  lng: number;
  when: string;
  price: string;
  certified: boolean;
};

export type MapProps = {
  pins: MapPin[];
  /** Centre and zoom, e.g. the state picked in Detty Travel. Fits all pins when omitted. */
  focus?: { lat: number; lng: number; zoom: number };
  className?: string;
};

// Leaflet touches `window`, so the real map only loads in the browser.
const LeafletMap = dynamic(() => import("./LeafletMap"), {
  ssr: false,
  loading: () => <div className="skeleton size-full" aria-label="Loading map" />,
});

export function EventMap(props: MapProps) {
  return (
    <div className={props.className ?? "h-[420px] overflow-hidden rounded-card border border-border"}>
      <LeafletMap {...props} />
    </div>
  );
}
