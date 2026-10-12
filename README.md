# Virtual Athens

A browser-based world for building and experimenting with a first settlement. Explore the Commons and seven procedural districts, construct and connect an energy system, invite a simulated resident, inspect its dependencies, compare a shortage scenario, and save or publish your creation into a shared landscape.

## Requirements and startup

Node.js **24+**, npm, and a desktop browser supporting WebGL2. No external API keys, database service, paid account, or downloaded art assets are required. Observation mode supports devices without WebGL.

```sh
npm ci --cache /workspace/.npm-cache
npm run dev
```

The development client listens on **5173**, with API/WebSocket traffic proxied to **3001**. For the production build:

```sh
npm run build
npm start
```

The single server serves the application and API on port **3001**. `PORT` overrides that server port. `ATHENS_DATA_DIR` overrides `.data`. The Vite proxy assumes port 3001 unless changed in `vite.config.js`.

## First playable settlement

1. Choose an explorer name and Enter Athens. WASD/arrows move your gold avatar; buildings block movement. Drag to orbit and scroll to zoom. Planning view provides overhead inspection.
2. Open Create. Choose a Residence, Workshop or Energy pavilion; click the illuminated parcel or enter X/Z coordinates and Place component. Components snap to a 2-unit grid and must fit within the parcel.
3. Select a building through the scene or inspector. Move, rotate, scale, duplicate or delete it; undo/redo tracks geometry edits.
4. Connect consumers to the settlement energy bus. Invite a Simulated resident using the component palette and connect it too. It wanders when powered and waits under shortages.
5. Choose a proportional allocation rule or construction-order priority. Activate Structural Vision to reveal energy sources, the bus, connections and operating states.
6. Change energy availability to compare baseline and scenario. Results are deterministic and evaluated server-side; your saved baseline is unchanged.
7. Register an account. Download and privately store the recovery code. You receive one persistent parcel, and your current guest draft becomes its initial creation. Owned parcel edits autosave after 1.8 seconds; Publish makes them public. Save draft makes the parcel private.
8. Return with the same account to recover your parcel automatically, or use Self → Load / claim my parcel. Self also provides export, version history/restore, text sizing, observation mode, sign-out and account deletion.
9. Open a second browser profile or private window. Published parcels occupy distinct locations, and spatial presence and text chat are shared. Other people can inspect/copy published creations but cannot overwrite your stored parcel. Society provides blocking and reporting.

Guest drafts are stored only in that browser. Account drafts are private. Publishing permits others to view and make local copies. The inspector always shows all components; in-world labels have a quality-dependent budget to limit rendering cost.

## Validation

```sh
npm test                 # simulation, input/ownership, persistence, recovery and isolation
npm run test:browser     # complete browser settlement loop and two participants
npm run test:performance # 80-component frame-time baseline; about 3 minutes
npm run test:acceptance  # build + tests + browser acceptance
```

Browser tests use an installed Chromium at `/usr/bin/chromium`. Set `ATHENS_CHROMIUM` to another Chromium executable where necessary; the tests require a real browser installation. Test servers use isolated temporary databases and do not modify your real accounts. Performance results are saved in `docs/performance-baseline.json`; a software renderer is not an integrated-GPU hardware certification.

## Data and operations

SQLite (`.data/athens.sqlite`, plus active WAL/SHM files) stores accounts, sessions, parcels, audit records, and recoverable snapshots transactionally. The previous `.data/world.json` format is imported once if present, and left intact as an archive. It is no longer the live store.

```sh
node server/admin.js integrity
node server/admin.js backup /absolute/path/to/new-backup.sqlite
node server/admin.js reports
node server/admin.js unpublish <parcel-id>
```

Backup uses SQLite's consistent snapshot operation. To restore: stop the server, preserve the existing database and WAL/SHM files, replace the database with a verified backup, remove the old WAL/SHM files, then restart and run `integrity`. Never replace the database while the server is running. Operator unpublishing preserves owner snapshots; restart to refresh connected clients.

No optional research or analytics collection is enabled. Chat/presence are ephemeral; reports are retained for operator review. Account export/deletion and recovery are built in. Internet deployment still requires HTTPS, a reviewed host/proxy configuration, monitoring, and an operator moderation process. This V1 targets one bounded shared instance, not large-scale public operations.

See [V1 acceptance](docs/v1-acceptance.md), [architecture and schema](docs/architecture.md), and [performance and roadmap](docs/roadmap.md).
