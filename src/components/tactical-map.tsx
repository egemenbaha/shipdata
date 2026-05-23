import { useEffect } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import { VesselLayer } from "./vessel-layer";
import { CorridorLayer } from "./corridor-layer";
import { RendezvousLayer } from "./rendezvous-layer";
import { StsPairLayer } from "./sts-pair-layer";
import { TheaterClusterLayer } from "./theater-cluster-layer";
import { useTimeline } from "@/state/timeline";
import { GLOBAL_VIEW } from "@/data/vessels";

function MapReady() {
  const map = useMap();
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 50);
    return () => clearTimeout(t);
  }, [map]);
  return null;
}

function MapFlyController() {
  const map = useMap();
  const { flyRequest } = useTimeline();
  useEffect(() => {
    if (!flyRequest) return;
    const targetZoom = flyRequest.zoom ?? Math.max(map.getZoom(), 7);
    map.flyTo([flyRequest.lat, flyRequest.lng], targetZoom, { duration: 1.1 });
  }, [flyRequest, map]);
  return null;
}

export function TacticalMap() {
  const { theater } = useTimeline();
  const isGlobal = theater === "global";

  return (
    <MapContainer
      center={GLOBAL_VIEW.center}
      zoom={5}
      zoomControl={true}
      className="h-full w-full"
      attributionControl={true}
      worldCopyJump
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
      {isGlobal ? (
        <TheaterClusterLayer />
      ) : (
        <>
          <VesselLayer />
          <RendezvousLayer />
          <StsPairLayer />
        </>
      )}
      <MapReady />
      <MapFlyController />
    </MapContainer>
  );
}
