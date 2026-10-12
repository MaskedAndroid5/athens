# Scope, performance and next phases

## V1 functional scope

The required V1 feature set is implemented: browser 3D exploration, a distinctive central environment, third-person movement/camera and collision, guest entry, account persistence, a small owned parcel, transform editing, save/load/autosave, an energy simulation, Structural Vision, world inspector, isolated scenario comparison, a lightweight multiplayer room, basic ownership and responsive graphics/accessibility settings. See `v1-acceptance.md` for the feature-to-evidence mapping.

The first settlement loop also includes simulated residents, explicit allocation rules, JSON export, persistent sessions and recovery codes, account deletion, snapshots/restore, chat/block/report controls and operator backup/moderation commands.

## Performance evidence and limits

`performance-before.json` records the diagnosed 80-component Structural Vision bottleneck: 174 draw calls and roughly 3–4 FPS on the cloud SwiftShader renderer. Building shells/floors are instanced, dependencies are batched into one line buffer per parcel, and in-world labels are budgeted; the inspector always retains all component states. Adaptive pixel ratio reduces GPU workload to a floor of 0.5. Low graphics reduces stars and label count. Assets are procedural and geometry is frustum culled; there are no model/texture downloads to stream.

The optimized cloud run measured 18 draw calls / 4.28 FPS on low and 21 draw calls / 4.47 FPS on standard, both at adaptive DPR 0.5. These measurements **do not meet the reference 30/60 FPS thresholds**. The available renderer is software rather than the reference GPU.

`performance-baseline.json` contains the latest repeatable measurement with CPU quota, renderer, viewport, frame counts, median/p95 frame time, draw calls and triangle count. `npm run test:performance` warms up for 10 seconds and samples for 60 seconds per quality at 1280×720 with 80 components and Structural Vision. It measures stationary inspection rather than walking or multiple visible browser windows.

The reference-device target remains 30 FPS on an integrated-GPU laptop (8 GB RAM, 1920×1080, recent Chrome) and 60 FPS on a capable desktop. The current cloud has **software graphics**, so those physical-device targets remain unverified. Do not present a software-rendering result as hardware certification. Use observation mode on devices that cannot render the 3D workload acceptably.

For hardware certification, run the benchmark on the actual reference device, add 60-second city-orbit and walking traces, and repeat with two simultaneous clients. Record GPU/browser/OS, viewport, quality, median/p95 frame times, peak memory and input response. A physical GPU is the remaining prerequisite for that validation.

## Explicit bounds

One process, 16 owned parcels, 24 simultaneous connections, 80 components per parcel. Published worlds are broadcast within this bounded instance; large-world interest management and distributed simulation are deferred. Geometry undo/redo does not include allocation policy. Accounts require a private recovery code; email recovery is not configured. Sessions last one day. Blocks last for the current connection/session; reports require a logged-in account and local operator review.

SQLite is the implemented conventional transactional database. PostgreSQL and multi-process persistence are a future deployment adapter. The simulation treats rates per shared one-second interval; it does not model resource inventories, currency, environmental physics or real economic prediction. The resident's behavior is a deterministic demonstration, not a detailed population simulation.

## Later phases

Delegated shared authoring and organisations; first-person/object engineering inspection; transport and environmental dependencies; jurisdiction rules and governance games; richer resource markets; sandboxed programmable components; AI-assisted plans; private research worlds; Ophanim platform integration interfaces; enterprise deployment and larger populations. These remain future work and are not shown as working controls.
