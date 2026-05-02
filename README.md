# Fi Racing

Formula **i** — AI-driven car racing for hobbyists.

Tune the car. Pick the mind. Watch them race.

A client-side web app where you configure cars (engine, gearing, tires, aero,
brakes), pick an AI driver style (aggressive / safe / overtaker), and race
multiple configs against each other on hand-authored 2D top-down tracks. After
each race, scrub the replay and compare telemetry between cars.

## Status

Early development. Currently building the simulation foundation (M1).

## Stack

- Vite + React + TypeScript
- Canvas2D for rendering (planned)
- uPlot for telemetry graphs (planned)
- Vitest for tests

## Scripts

- `npm run dev` — start dev server
- `npm run build` — type-check and build
- `npm test` — run unit tests
- `npm run lint` — lint
- `npm run format` — format
