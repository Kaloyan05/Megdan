import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enc, dec } from '../src/net/store-firebase.js';

test('Firestore: масив в масив се кодира и декодира без загуба', () => {
  const data = { ships: [[1, 2, 3], [10], []], moves: [{ i: 0, m: { hold: [true, false], sunk: [4, 5] } }], n: null, s: 'x', nested: { a: [[1], [2, [3]]] } };
  const e = enc(data);
  assert.ok(!Array.isArray(e.ships[0]), 'вътрешният масив е обвит');
  assert.deepEqual(dec(e), data);
});

test('Firestore: undefined полета отпадат', () => {
  assert.deepEqual(enc({ a: 1, b: undefined }), { a: 1 });
});
