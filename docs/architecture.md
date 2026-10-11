# Architecture and world schema

## Decision record 001: small authoritative modular application

React/TypeScript and React Three Fiber render procedural geometry. The pure simulation module has no renderer dependencies. An Express/Node server owns accounts, parcel mutations, revisions and persistence. WebSocket messages carry presence and committed published world updates; they cannot edit stored objects. The client is responsible for transient editing and scenario inspection.

A transactional PostgreSQL service is the intended production store. For this runnable first version, a serialized atomic file replacement stores the world; this supports one server process only. Scrypt password hashes and random HttpOnly session cookies provide local accounts. Sessions expire after a day and require login after server restart. TLS is required for deployment; production cookies are Secure.

## Implemented schema (model version 1)

- Account: `id`, case-insensitive unique `name`, password `salt`, scrypt `hash`. Passwords never enter world responses.
- Parcel: `id`, `owner` (account UUID), `slot`, `objects`, `revision`, `published`, `policy`.
- Object: stable `id`, `kind` (`home`, `workshop`, `solar`), `position` ([x,z], within ±18), `rotation` (radians), `scale` (0.5–2), `connected`.
- Audit entry: `id`, `actor`, `parcel`, `revision`, `time`, `action` (save/publish).
- Presence: ephemeral connection UUID, display name, bounded x/z position. Names are self-reported, not verified account identities.
- Scenario: client-local baseline objects, availability factor [0,1], allocation policy; deterministic output contains supply, demand, usage, surplus and per-object delivery/status.

## Simulation assumptions

Each pavilion supplies 12 energy units per simulation interval. Residences demand 4; workshops demand 8. Connected consumers draw from one ideal settlement bus, without distance loss. Scaling geometry does not alter nominal energy ratings. Proportional allocation distributes shortages by demand; priority allocates in construction order. Surplus is unconsumed generation. Disconnected consumers receive zero. These are simplified model estimates, not real-world predictions. No hidden random behavior is involved.

## Rights and boundaries

Guests may view published parcels and modify local copies. Authenticated accounts claim one persistent parcel and exclusively modify it. Server input validation strips unknown fields and caps each parcel at 80 components. Stale revisions produce HTTP 409. Draft parcels are excluded from public world messages. Public requests are limited to 120 per minute per server-observed IP; WebSocket payloads and movement cadence are bounded. There are at most 16 persistent parcels and 24 concurrent connections.

The shared room broadcasts a small bounded world; interest management is deferred. Published settlements are selected for inspection in the central workbench, rather than simultaneously rendered at unique geographical parcels. No user scripts, uploads, monetary trades or research telemetry are accepted. Model export is JSON; account deletion, password recovery and schema migrations remain future work.
