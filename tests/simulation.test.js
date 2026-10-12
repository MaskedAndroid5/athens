import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate } from '../src/simulation.js';
import { validateObjects, canModify } from '../server/model.js';
const object = (id, kind, connected = true) => ({
  id,
  kind,
  connected,
  position: [0, 0],
  rotation: 0,
  scale: 1,
});
test('energy balances and constrained scenario is reproducible without mutating baseline', () => {
  const input = [object('s', 'solar'), object('h', 'home'), object('w', 'workshop')];
  const before = structuredClone(input);
  const base = simulate(input);
  const scenario = simulate(input, 0.7);
  assert.equal(base.used, 12);
  assert.equal(scenario.supply, 8.399999999999999);
  assert.ok(Math.abs(scenario.objects.reduce((n, o) => n + o.delivered, 0) - scenario.used) < 1e-9);
  assert.equal(scenario.objects[1].status, 'constrained');
  assert.deepEqual(scenario, simulate(input, 0.7));
  assert.deepEqual(input, before);
});
test('disconnected consumers cannot draw power', () => {
  const s = simulate([object('s', 'solar'), object('h', 'home', false)]);
  assert.equal(s.used, 0);
  assert.equal(s.objects[1].delivered, 0);
  assert.equal(s.surplus, 12);
});
test('priority uses construction order without creating energy', () => {
  const s = simulate(
    [object('s', 'solar'), object('h', 'home'), object('w', 'workshop')],
    0.5,
    'priority',
  );
  assert.equal(s.objects[1].delivered, 4);
  assert.equal(s.objects[2].delivered, 2);
});
test('server rejects malformed objects, duplicate IDs and parcel escapes', () => {
  for (const input of [
    [object('a', 'unknown')],
    [object('a', 'home'), object('a', 'solar')],
    [{ ...object('a', 'home'), position: [100, 0] }],
    [{ ...object('a', 'home'), scale: Infinity }],
  ])
    assert.throws(() => validateObjects(input));
  assert.equal(validateObjects([object('a', 'home')]).length, 1);
});
test('ownership requires authenticated matching identity', () => {
  assert.equal(canModify({ owner: 'a' }, null), false);
  assert.equal(canModify({ owner: 'a' }, { id: 'b' }), false);
  assert.equal(canModify({ owner: 'a' }, { id: 'a' }), true);
});
test('a resident enters constrained state when the settlement loses power', () => {
  const objects = [object('s', 'solar'), object('r', 'resident')];
  assert.equal(simulate(objects).objects[1].status, 'operational');
  assert.equal(simulate(objects, 0).objects[1].status, 'constrained');
});
test('rotated and scaled footprints cannot cross parcel boundaries', () => {
  assert.throws(() => validateObjects([{ ...object('a', 'solar'), position: [18, 0] }]));
  assert.throws(() =>
    validateObjects([
      { ...object('a', 'home'), position: [17, 0], rotation: Math.PI / 4, scale: 2 },
    ]),
  );
  assert.equal(validateObjects([{ ...object('a', 'home'), position: [16, 0] }]).length, 1);
});
