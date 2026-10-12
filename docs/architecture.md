# Architecture and world-state schema

## ADR 001: one bounded authoritative application

React/TypeScript and React Three Fiber render the world. A pure simulation module evaluates explicit resource accounting independently of graphics. Express/Node owns accounts, permissions, persistent parcel state, simulation validation and revision history. WebSockets carry ephemeral spatial presence/chat, committed public updates, and a shared one-second world clock. Client drafts and scenarios never overwrite authoritative state without validated owner requests.

Building shells, outlines and floors use three instanced draw calls across the scene. Structural connections use one line buffer per parcel; labels use quality-dependent budgets. Geometry is procedural and frustum culled; there are no texture or model downloads to stream. DPR adapts down to 0.5 on slow renderers. Camera transitions and resident animation respect reduced motion. A lightweight SVG observation view preserves editing and inspection without WebGL.

### Persistence choice

V1 uses **SQLite with WAL and explicit transactions** through Node 24's built-in driver. It satisfies conventional transactional ownership, audit and recovery requirements without introducing an external service for a small shared instance. PostgreSQL is the recommended next adapter for concurrent application processes or multiple world servers; it is not a hidden dependency or an implemented deployment claim. Schema version 1 is recorded in metadata, and a one-time legacy JSON migration preserves prior creations. Foreign keys cascade account deletion to private history, parcels and sessions. Each revision stores a recoverable snapshot in the same transaction as its mutation. Consistent backups use `VACUUM INTO`.

### Authentication and boundaries

Scrypt password derivation runs asynchronously. HttpOnly, SameSite=Strict random session cookies are backed by hashed session identifiers in the database, expire after a day, and survive server restart. Production cookies are Secure; deployment requires HTTPS. Registration returns a one-time recovery code; only its hash is stored. Recovery rotates the code, password, and sessions. Account deletion requires password confirmation. Authentication endpoints and general requests have separate IP limits.

Input validation enforces object kinds, stable nonempty IDs, uniqueness within each parcel, finite transforms, complete rotated/scaled parcel bounds and an 80-object budget. Revision compare-and-swap rejects stale saves. Client writes are serialized; autosave preserves publication state and pauses on conflicts. Ownership is checked for mutations, private history and restore. Drafts are excluded from public world responses. Cross-origin HTTP and WebSocket requests are rejected. WebSocket payloads, room population and movement cadence are bounded; heartbeat removes dead connections. Chat is plain text rendered by React, capped at 300 characters with a two-second cooldown.

## Schema (version 1)

| Entity   | Fields and behavior                                                                                                                                                                                |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account  | UUID `id`; case-insensitive unique `name`; password `salt` and `hash`; hashed `recovery` code. Only ID/name are public.                                                                            |
| Session  | SHA-256 token identifier; owner account; expiry in milliseconds.                                                                                                                                   |
| Parcel   | UUID `id`, account `owner`, unique geographical `slot` 0–15, `objects`, `revision`, `published`, allocation `policy`.                                                                              |
| Object   | Stable `id`, `kind` (`home`, `workshop`, `solar`, `resident`), `position` [x,z], radians `rotation`, `scale` 0.5–2, `connected` flag.                                                              |
| History  | UUID, parcel, actor, revision, ISO timestamp, action, immutable snapshot body. Restore creates a new revision rather than deleting history.                                                        |
| Report   | UUID, reporting account, subject connection ID, reason, timestamp. Local operator CLI reviews reports and can unpublish a parcel.                                                                  |
| Presence | Ephemeral connection UUID, optional verified account ID, display name, position. Guest names are self-reported. Reconnection receives the committed world and resends the current client position. |
| Scenario | Model version 1, seed 0, initial component state, allocation policy, energy factor [0,1], evaluation tick, assumptions, baseline and scenario outputs.                                             |

Regions, parcels and primitive actors form the V1 world. Organisations, jurisdictions, markets, transport and programmable systems remain future modules; no inactive integrations are presented as working features.

## Ownership rights

| Subject                     | Rights                                                                                                               |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Owner                       | View/use, modify, duplicate, delete components, save, publish/unpublish, export, inspect history, restore snapshots. |
| Public visitor              | View/use published geometry and simulated outputs; make a local copy. No modification of the original parcel.        |
| Other authenticated account | Public rights, plus exclusive ownership of its own distinct parcel.                                                  |
| Local operator              | Read reports, unpublish offending creations with an audited snapshot, back up and verify the database.               |

Object ownership inherits the parcel owner. An object-ID registry reserves identities to their account even after deletion, so snapshot restores retain identity. Public copies receive fresh UUIDs; cross-account identity reuse is rejected. Administrative access is separate from account ownership. V1 does not include leases, transfers, delegated co-authoring, real-world title, tokens or payment.

## Simulation model and integrity

Each energy pavilion generates 12 units per one-second interval. Residences demand 4, workshops 8, and simulated residents 1. Connected consumers use an ideal settlement bus. Proportional allocation distributes shortages by demand; priority allocates in creation order. Delivery plus surplus equals generated supply. Surplus denotes unused generation dissipated in this model; no storage or hidden resource source is assumed. Geometry scaling does not alter component ratings. Disconnected consumers receive zero.

Resident policy is a deterministic two-state machine: powered → bounded wandering around its origin; constrained/disconnected → waiting. Motion is presentation of that state and does not alter energy accounting. World ticks are shared real-time intervals, not a accumulated finite-stock economy. The scenario API evaluates a branch without saving it, captures model version/seed/assumptions, and uses the same pure function as client previews. Identical initial state and parameters produce identical resource results.

These are simplified model estimates, not proven real-world predictions. Distance loss, environmental generation changes, stored energy, construction cost and scientific calibration are unsupported. Source code and assumptions are explicit so later models can replace this subsystem without coupling it to the renderer.
