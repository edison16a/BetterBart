"use client";

import { useEffect } from "react";

import { startBetterBart } from "@/features/bart/runtime/startBetterBart";
import { MapChrome } from "./MapChrome";
import { StationSearch } from "./StationSearch";
import { TripPanel } from "./TripPanel";

/**
 * Composes the stable React shell and starts the interactive SVG runtime once
 * the client DOM is available.
 */
export function BetterBartApp() {
  useEffect(() => startBetterBart(), []);

  return (
    <>
      <svg
        id="map"
        preserveAspectRatio="xMidYMid meet"
        role="application"
        aria-label="BART system map"
      />
      <StationSearch />
      <TripPanel />
      <MapChrome />
    </>
  );
}
