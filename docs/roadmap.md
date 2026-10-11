# Scope and performance

## Implemented first playable settlement

Procedural seven-district vista; third-person avatar movement and orbit/planning views; guest entry; account login; parcel claim; snapped placement, rotation, scaling, movement, deletion, geometry undo/redo; explicit save/load and JSON export; pure energy simulation; allocation rules; Structural Vision; energy availability comparison; published parcel inspection; live spatial presence; server-enforced ownership and revision checks; atomic persistence and audit records.

## Remaining V1 work

Terrain-aware walking/collision and camera following; simulated residents; spatial rendering of every parcel; account deletion/recovery; transactional PostgreSQL persistence, migrations and recovery tools; hardened abuse controls and moderation; reconnection movement reconciliation; repeatable browser regression suite and hardware profiling. Undo applies to construction geometry, not allocation policies. The UI uses explicit saving, not autosave. There is no shared-authoring delegation or continuous simulation clock yet.

Later phases: transport, environmental constraints, institutions, markets, sandboxed programmable components, enterprise models and Ophanim integration adapters. These are not represented as functioning features.

## Performance budget and profiling protocol

Target reference: integrated graphics laptop, 8 GB RAM, 1920×1080, recent Chrome/WebGL2; target 30 FPS low quality and 60 FPS capable desktop. These targets are **not yet measured or certified**. The scene uses procedural geometry, no external assets, bounded parcel complexity, low-mode pixel ratio 1, standard ratio capped at 1.5, and reduced star count. Transparency is intentionally restrained. No expensive postprocessing is used.

To establish a hardware baseline: production build; record device, GPU, browser and viewport; wait 10 seconds for warmup; collect 60 seconds of frame times while orbiting the city, then a parcel with 80 objects and Structural Vision enabled; report median and p95 frame time, memory and draw calls for both quality modes. Repeat with two clients. A real browser/device run is required before claiming performance acceptance.

Accessibility includes labelled controls, keyboard movement, visible focus, readable text, state names alongside colors, reduced-motion CSS and lower graphics settings. A non-WebGL observation mode and configurable text scale remain outstanding.

## Current validation evidence

Production build and six automated tests passed. A Chromium browser smoke run rendered the WebGL scene without page errors, placed and connected a residence and energy pavilion, changed availability to 20% (delivery 4.0 → 2.4), registered an account, saved/published and reloaded the parcel, and joined a second browser session. Software rendering in this environment does not establish the hardware FPS targets. Test accounts were removed after validation.
