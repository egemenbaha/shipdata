import { useEffect } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import { VesselLayer } from "./vessel-layer";
import { CorridorLayer } from "./corridor-layer";
import { RendezvousLayer } from "./rendezvous-layer";

function MapReady() {
  const map = useMap();
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 50);
    return () => clearTimeout(t);
  }, [map]);
  return null;
}

export function TacticalMap() {
  return (
    <MapContainer
      center={[35, 18]}
      zoom={5}
      zoomControl={true}
      className="h-full w-full"
      attributionControl={true}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        subdomains="abcd"
        maxZoom={19}
      />
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png"
        subdomains="abcd"
        maxZoom={19}
      />
      <CorridorLayer />
      <VesselLayer />
      <RendezvousLayer />
      <MapReady />
    </MapContainer>
  );
}
