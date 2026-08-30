# BetterBART feature

This directory contains the complete transit experience behind the root page.

- `components/` defines the stable React-owned page regions.
- `data/` is the authoritative station and line catalog.
- `core/` contains reusable projection and shortest-path routing logic.
- `runtime/` owns the SVG scene, gestures, live train simulation, geolocation, and DOM updates whose
  timing is intentionally kept together.

The runtime uses the same DOM IDs and generated SVG structure as the original single-file
application. This preserves behavior and appearance while keeping the domain data and algorithms
independently testable.
