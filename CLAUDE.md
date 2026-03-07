# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start Express dev server with Vite HMR (tsx server.ts)
npm run build        # Run generate-data then Vite bundle (outputs to /dist)
npm run generate-data  # Convert GeoJSON routes → public/data/routes-data.json
npm run lint         # TypeScript type-check (tsc --noEmit, no test framework)
npm run preview      # Preview production build locally
```

**Important:** `npm run build` automatically runs `generate-data` as a prebuild step. Run `generate-data` manually after adding or editing files in `/routes`.

## Architecture

### Dual-Mode Routing

The app has two parallel routing implementations:
- **Development:** [server.ts](server.ts) (Express) + [src/database.ts](src/database.ts) (SQLite via `better-sqlite3`) + [src/route-algorithm.ts](src/route-algorithm.ts)
- **Production:** [src/lib/transitRouter.ts](src/lib/transitRouter.ts) loads `/public/data/routes-data.json` directly in the browser

These must stay in sync. Changes to routing logic typically need to be applied to both `route-algorithm.ts` and `transitRouter.ts`.

### Data Pipeline

```
/routes/*.geojson (94 files)
  → scripts/generate-data.ts (deduplicates stops, assigns colors)
  → public/data/routes-data.json (embedded at build time)
  → src/lib/transitRouter.ts (loads at runtime in browser)
```

Route files follow naming patterns: `001_route.geojson`, `001_stops.geojson`, with `_ida`/`_vuelta` variants for bidirectional routes.

### Component Architecture

[src/App.tsx](src/App.tsx) owns all state (origin, destination, mode, routes, radius) and orchestrates auto-search with a 900ms debounce. It renders two children:

- **[src/components/Map.tsx](src/components/Map.tsx):** Leaflet map with 5 tile layer styles, click-to-set-origin/destination, route polyline + stop circle rendering
- **[src/components/Sidebar.tsx](src/components/Sidebar.tsx):** Search inputs (Nominatim geocoding), transport mode selector, route results with turn-by-turn instructions, radius expansion UI

### Routing Logic ([src/lib/transitRouter.ts](src/lib/transitRouter.ts))

- **Transit:** Finds stops within radius (default 1000m, expandable to 1500/2000/3000m) using haversine distance; matches origin→destination stop pairs across shared routes; returns up to 5 alternatives
- **Walking/Cycling/Driving:** Calls OSRM with profile-specific servers:
  - `routing.openstreetmap.de` for foot and bike profiles
  - `router.project-osrm.org` for car profile

### Deployment

GitHub Actions ([.github/workflows/deploy.yml](.github/workflows/deploy.yml)) auto-deploys on push to `main`: runs `generate-data`, Vite build, pushes `/dist` to `gh-pages` branch. Vite base path is set to `/City-Transit/` for GitHub Pages hosting.

### Path Aliases

`@/*` maps to the repository root (e.g., `@/src/lib/transitRouter`). Defined in both [tsconfig.json](tsconfig.json) and [vite.config.ts](vite.config.ts).
