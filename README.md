# Virtual Athens

A desktop-first playable settlement prototype for Ophanim Technologies. Explore a procedural transparent city, construct a settlement, connect energy consumers, inspect causal dependencies, and compare an energy-shortage scenario. Public exploration is free.

## Run

Requires Node.js 22.12+ (validated on 24.19).

```sh
npm ci --cache /workspace/.npm-cache
npm run dev
```

Vite serves the client on port 5173 and proxies HTTP and WebSocket traffic to port 3001. For a single-server build:

```sh
npm run build
npm start
```

The server serves `dist` on port 3001. `PORT` overrides the server port. `ATHENS_DATA_DIR` overrides the data directory (default `.data`). Back up `world.json` to retain accounts and creations. No external credentials or services are required.

## First playable loop

1. Enter as a guest. WASD/arrows move the gold avatar; mouse drag orbits and scroll zooms.
2. Open Create. Choose a component and click within the illuminated parcel.
3. Place residences, a workshop, and energy pavilions. Select buildings and connect them to the settlement energy bus.
4. Rotate, resize, move or delete selected objects. Undo/redo tracks local geometry edits.
5. Choose proportional allocation or construction-order priority.
6. Activate Structural Vision to inspect delivery and dependency lines. Reduce availability to compare baseline with an isolated scenario.
7. Create an account (password minimum 10 characters), then save or publish. On returning, sign in and use Self → Load / claim my parcel.
8. Open another browser session. Presence is shared; published settlements can be inspected from Society. Only their owner may save changes.

The builder edits a local draft; Save/Publish is the explicit authoritative commit. Published creations are visible to guests. Guest edits are lost on reload; export JSON before leaving if needed. Remote saves use revision checks to reject stale writes.

## Validation

`npm test` covers resource accounting, deterministic scenarios, malformed inputs, ownership, live WebSocket updates and persistence across server restart. `npm run build` checks TypeScript and builds the client. See [architecture](docs/architecture.md) and [scope and performance](docs/roadmap.md).

This is a local development prototype, not a production deployment. Do not expose its current identity service publicly without production hardening.
