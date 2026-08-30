# BetterBART

BetterBART is a focused BART map, departures viewer, and trip planner. It keeps the original
single-screen experience: choose an origin and destination, tap or drag between stations, and follow
one clear instruction at a time.

https://betterbart.vercel.app/

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The app uses its mobile layout by default,
matching the original. Use `/web` or `?view=web` for the desktop layout and `/mobile` or
`?view=mobile` to force the mobile layout.

## Quality checks

```bash
npm run lint
npm test
npm run build
```

`npm run check` runs all three commands in sequence. The production build is fully static and does
not require a backend.

## Project structure

```text
src/
├── app/                         Next.js layout, route, and global styles
└── features/bart/
    ├── components/              React-owned UI regions
    ├── core/                    Projection, geometry, and route finding
    ├── data/                    Stations and BART lines
    └── runtime/                 SVG scene, gestures, arrivals, and trip UI
```

The React components own the stable, accessible document structure. The client runtime owns the
highly coordinated SVG and live transit state. Keeping that imperative boundary intact preserves the
exact visuals, pointer behavior, animation timing, and geolocation flow of the original app, while
the network data and routing algorithms remain isolated and reusable.

## Behavior preserved

- All 50 stations and six displayed services
- Pan, zoom, pinch, double-click zoom, and drag-to-plan gestures
- Station search, selection, clear, reset, and swap controls
- Simulated live departures and step-by-step trip directions
- Route highlighting, animated direction markers, and line visibility toggles
- Automatic geolocation dot and trip-step advancement
- Desktop panel and draggable mobile bottom sheet

The original [`index.html`](./index.html) remains in the repository as a visual and behavioral
reference; Next.js serves the application from `src/`.
