import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { CodeSpec } from '../src/types.ts';
import {
  CONFUSABLE_GROUPS, normalize, matchSpec, validateSpec, formatSpec,
} from '../src/codes.ts';

// Excludes the confusable letters I and O, but keeps every digit — so a typed
// O has exactly one home (0), while I is ambiguous between 1 and L.
const NARROW: CodeSpec = {
  lengths: [15], groups: [5, 5, 5], separator: '-',
  alphabet: 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789', verifiedAt: '2026-09-04',
};
const WIDE: CodeSpec = {
  lengths: [16], alphabet: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
  prefixes: ['XG'], verifiedAt: '2026-09-04',
};
const BARE: CodeSpec = { lengths: [11, 13], verifiedAt: '2026-09-04' };

test('normalize strips separators and whitespace and uppercases', () => {
  assert.equal(normalize('  ab-cde fgh '), 'ABCDEFGH');
  assert.equal(normalize('AB–CD'), 'ABCD');
});

test('normalize resolves a confusable when exactly one partner is in the alphabet', () => {
  // NARROW has 0 but not O, so a typed O must have meant 0.
  assert.equal(normalize('OOO', NARROW), '000');
});

test('normalize leaves a confusable alone when the group is ambiguous', () => {
  // WIDE has both O and 0, so neither is rewritten.
  assert.equal(normalize('O0', WIDE), 'O0');
});

test('normalize leaves characters with no confusable group alone', () => {
  // '#' is outside the alphabet and in no group, so there is nothing to map it to.
  assert.equal(normalize('###', NARROW), '###');
});

test('matchSpec rejects a code longer than the longest declared length', () => {
  assert.equal(matchSpec(NARROW, 'A'.repeat(16)), null);
});

test('matchSpec accepts a partial code as an incomplete candidate', () => {
  const m = matchSpec(NARROW, 'ABCDE');
  assert.equal(m?.complete, false);
  assert.deepEqual(m?.matchedOn, ['alphabet']);
});

test('matchSpec marks an exact-length code complete', () => {
  const m = matchSpec(NARROW, 'ABCDEFGHJKLMNPQ');
  assert.equal(m?.complete, true);
  assert.deepEqual(m?.matchedOn, ['alphabet', 'length']);
});

test('matchSpec keeps a candidate while the prefix is still being typed', () => {
  // 'X' is shorter than the 'XG' prefix but is a prefix OF it.
  assert.notEqual(matchSpec(WIDE, 'X'), null);
  assert.equal(matchSpec(WIDE, 'ZZ'), null);
});

test('matchSpec rejects a character outside the alphabet', () => {
  assert.equal(matchSpec(NARROW, 'ABCDI'), null); // I excluded from NARROW
});

test('matchSpec on a bare spec matches any characters of a declared length', () => {
  const m = matchSpec(BARE, '!!!@@@###$$');
  assert.equal(m?.complete, true);
  assert.deepEqual(m?.matchedOn, ['length']);
});

test('matchSpec rejects an empty code', () => {
  assert.equal(matchSpec(NARROW, ''), null);
});

test('validateSpec reports a length error with expected and actual', () => {
  const r = validateSpec(NARROW, 'ABCDE');
  assert.equal(r.valid, false);
  const err = r.errors.find((e) => e.code === 'length');
  assert.deepEqual(err?.code === 'length' ? err.expected : null, [15]);
  assert.equal(err?.code === 'length' ? err.actual : null, 5);
});

test('validateSpec reports invalid characters with their positions', () => {
  const r = validateSpec(WIDE, 'XG!!!!!!!!!!!!!!');
  const err = r.errors.find((e) => e.code === 'alphabet');
  assert.equal(err?.code === 'alphabet' ? err.invalidChars.includes('!') : false, true);
  assert.equal(err?.code === 'alphabet' ? err.positions[0] : null, 2);
});

test('validateSpec reports a prefix error', () => {
  const r = validateSpec(WIDE, 'ZZCDEFGHIJKLMNOP');
  assert.equal(r.errors.some((e) => e.code === 'prefix'), true);
});

test('validateSpec accepts a well-formed code', () => {
  assert.deepEqual(validateSpec(NARROW, 'abcde-fghjk-lmnpq'), { valid: true, errors: [] });
});

test('formatSpec inserts the separator at the group offsets', () => {
  assert.equal(formatSpec(NARROW, 'ABCDEFGHJKLMNPQ'), 'ABCDE-FGHJK-LMNPQ');
});

test('formatSpec returns the code unchanged when the spec declares no groups', () => {
  assert.equal(formatSpec(BARE, 'ABCDEFGHJKL'), 'ABCDEFGHJKL');
});

test('format then normalize round-trips for a grouped spec', () => {
  const code = 'ABCDEFGHJKLMNPQ';
  assert.equal(normalize(formatSpec(NARROW, code), NARROW), code);
});

test('CONFUSABLE_GROUPS is exported for review and contains no duplicate characters', () => {
  const all = CONFUSABLE_GROUPS.join('');
  assert.equal(new Set(all).size, all.length);
});
