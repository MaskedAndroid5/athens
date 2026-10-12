# V1 acceptance matrix

This maps the 15 required features in section 20 of the supplied brief to concrete implementation and validation. It does not claim the deferred civilisation features are present.

| Requirement                        | Implementation                                                                                     | Evidence                                                              |
| ---------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 1. Browser-based 3D world          | WebGL2, procedural terrain and geometry                                                            | Browser acceptance renders the canvas without page errors             |
| 2. Distinctive central environment | Seven districts, elevated civic centre, transparent volumes, silver outlines, cyan infrastructure  | Rendered scene and procedural implementation in `src/world.tsx`       |
| 3. Third-person movement/camera    | Gold avatar, WASD/arrows, building collision, orbit, smooth planning transition                    | Browser movement assertion checks actual avatar coordinates           |
| 4. Guest exploration               | Explorer name, free entry, no registration gate                                                    | Acceptance starts as a guest                                          |
| 5. Account persistence             | Scrypt accounts, persistent sessions, SQLite, recovery code                                        | API test verifies session/parcel recovery across server restart       |
| 6. Editable parcel                 | One owned spatial slot per account; separate guest workbench                                       | Account claim and shared-world tests                                  |
| 7. Place/rotate/scale/delete       | Snapping, full-bound validation, selection, duplicate, geometry undo/redo, keyboard placement      | Browser creates components; unit tests validate transforms and bounds |
| 8. Save/load                       | Debounced autosave, manual save, publish/unpublish, automatic returning load, snapshots/restore    | Browser reload and autosave checks; API snapshot test                 |
| 9. Energy simulation               | Sources/consumers, proportional/priority allocation, deterministic resident state                  | Accounting and state-machine unit tests                               |
| 10. Structural Vision              | Batched bus dependencies, state colors, budgeted labels and full inspector                         | Browser activates mode and verifies shortage states                   |
| 11. World inspector                | IDs, ownership/rights, transforms, dependencies, per-component delivery and state                  | Browser verifies component counts and scenario output                 |
| 12. Scenario comparison            | Isolated energy availability branch with server-evaluated baseline/result                          | Scenario isolation and deterministic tests; browser comparison        |
| 13. Multiplayer room               | Bounded 24-person presence/chat; public spatial parcels; reconnect/heartbeat                       | Two-browser acceptance and WebSocket committed-update test            |
| 14. Permissions/ownership          | Owner-only writes/history/restore, public copies, revision conflicts                               | Unauthorized edit, private draft and stale-write rejection tests      |
| 15. Responsive UI/settings         | Low/standard quality, adaptive DPR, text sizing, reduced motion, mobile controls, observation mode | Mobile/observation browser acceptance                                 |

## Complete interaction loop

A guest builds a residence and energy pavilion, connects the bus, invites a simulated resident, selects an allocation rule, activates Structural Vision and reduces supply. The server produces an explainable shortage without changing the baseline. The participant can revise, create an account, save/publish, and recover the creation on return. A second participant sees the shared instance and can inspect/copy public creations but receives HTTP 403 on unauthorized writes. Existing API tests verify persistence through a real server restart, not just page refresh.

## Evidence boundary

Functional and browser acceptance tests are automated and reproducible. Performance is measured separately and recorded with renderer, CPU quota, viewport and sample duration in `performance-baseline.json`. The cloud renderer is SwiftShader software rendering. Its results must not be represented as certification of 30 FPS on an integrated-GPU laptop or 60 FPS on a capable desktop. Physical-device certification remains an external hardware validation step.

The application is a bounded V1 shared instance, not a claim of production public deployment. HTTPS, backup scheduling, host configuration and staffed moderation are deployment requirements. PostgreSQL, delegated collaborative editing, first-person mode, complex economics and large autonomous populations are roadmap features.
