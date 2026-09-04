import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  brands,
  getBrand,
  byCategory,
  byRegion,
  denominations,
  canRedeem,
  byRegionLock,
  regionCodes,
  meta,
  detect,
  validate,
  format,
} from '../src/index.ts';

test('catalog is non-empty and every brand has a unique id', () => {
  assert.ok(brands.length > 0);
  const ids = brands.map((b) => b.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('every brand has at least one region with denominations', () => {
  for (const b of brands) {
    assert.ok(b.regions.length > 0, `${b.id} has no regions`);
    for (const r of b.regions) {
      assert.ok(r.denominations.length > 0, `${b.id}/${r.code} has no denominations`);
      assert.match(r.currency, /^[A-Z]{3}$/, `${b.id}/${r.code} bad currency`);
    }
  }
});

test('getBrand finds a known brand and misses an unknown one', () => {
  assert.equal(getBrand('steam')?.name, 'Steam Wallet');
  assert.equal(getBrand('not-a-brand'), undefined);
});

test('byCategory filters', () => {
  const gaming = byCategory('gaming');
  assert.ok(gaming.length > 0);
  assert.ok(gaming.every((b) => b.category === 'gaming'));
});

test('byRegion includes GLOBAL brands as a fallback', () => {
  const us = byRegion('us');
  assert.ok(us.some((b) => b.id === 'steam'));
  assert.ok(us.some((b) => b.id === 'telegram-premium'));
});

test('denominations returns face values, empty for unknown input', () => {
  assert.ok(denominations('steam', 'US').includes(20));
  assert.deepEqual(denominations('nope', 'US'), []);
});

test('canRedeem enforces strict region locks', () => {
  assert.equal(canRedeem('apple', 'US', 'US').ok, true);
  assert.equal(canRedeem('apple', 'US', 'GB').ok, false);
});

test('canRedeem allows loose and unlocked brands across regions', () => {
  assert.equal(canRedeem('roblox', 'US', 'GB').ok, true);
  assert.equal(canRedeem('discord-nitro', 'US', 'TR').ok, true);
});

test('canRedeem reports unknown brands instead of throwing', () => {
  const r = canRedeem('nope', 'US', 'US');
  assert.equal(r.ok, false);
  assert.match(r.reason, /Unknown brand/);
});

test('byRegionLock and regionCodes return usable data', () => {
  assert.ok(byRegionLock('strict').length > 0);
  assert.ok(regionCodes().includes('US'));
});

test('meta carries a version and an updated date', () => {
  assert.match(meta.version, /^\d+\.\d+\.\d+$/);
  assert.match(meta.updated, /^\d{4}-\d{2}-\d{2}$/);
});

test('canRedeem reports a branchable outcome, not just a boolean', () => {
  const apple = canRedeem('apple', 'US', 'GB');
  assert.equal(apple.outcome, 'rejected');
  assert.equal(apple.keyedOn, 'account-country');

  const roblox = canRedeem('roblox', 'US', 'GB');
  assert.equal(roblox.outcome, 'value-differs');
  assert.equal(roblox.ok, true);

  const discord = canRedeem('discord-nitro', 'US', 'TR');
  assert.equal(discord.outcome, 'accepted');

  assert.equal(canRedeem('apple', 'US', 'US').outcome, 'ok');
});

test('every brand carries a lock, and only code products carry a code block', () => {
  for (const b of brands) {
    assert.ok(b.lock.note.length > 10, `${b.id} lock.note too short`);
    assert.equal(b.code !== undefined, b.deliveryType === 'code', `${b.id} code/deliveryType mismatch`);
  }
});

test('byRegionLock still derives the old classification', () => {
  assert.ok(byRegionLock('strict').some((b) => b.id === 'apple'));
  assert.ok(byRegionLock('loose').some((b) => b.id === 'roblox'));
  assert.ok(byRegionLock('none').some((b) => b.id === 'discord-nitro'));
});

test('detect ranks an exact-length match above a partial', () => {
  // 15 chars: steam is complete; nothing else declares 15.
  const hits = detect('ABCDEFGHJKLMNPQ');
  assert.equal(hits[0]?.brandId, 'steam');
  assert.equal(hits[0]?.complete, true);
});

test('detect puts the prefix-constrained brand first among equal lengths', () => {
  // apple, spotify and nintendo all declare 16; only apple requires the X prefix.
  const hits = detect('XABCDEFGHJKLMNPQ');
  assert.equal(hits[0]?.brandId, 'apple');
  assert.ok(hits[0]?.matchedOn.includes('prefix'));
});

test('detect eliminates a prefix-constrained brand when the prefix is absent', () => {
  const ids = detect('ZABCDEFGHJKLMNPQ').map((h) => h.brandId);
  assert.equal(ids.includes('apple'), false);
  // spotify and nintendo are genuinely indistinguishable here.
  assert.ok(ids.includes('spotify') && ids.includes('nintendo'));
});

test('detect keeps a partially typed code as a candidate', () => {
  assert.ok(detect('ABC').length > 0);
  assert.ok(detect('ABC').every((h) => h.complete === false));
});

test('detect returns an empty array rather than throwing on junk', () => {
  assert.deepEqual(detect(''), []);
  assert.deepEqual(detect('   '), []);
  assert.deepEqual(detect('A'.repeat(60)), []);
});

test('detect never returns a non-code product', () => {
  const ids = detect('ABCDEFGHJKL').map((h) => h.brandId);
  assert.equal(ids.includes('discord-nitro'), false);
  assert.equal(ids.includes('telegram-premium'), false);
});

test('detect ordering is deterministic', () => {
  assert.deepEqual(detect('ABCDEFGHJKLMNPQR'), detect('ABCDEFGHJKLMNPQR'));
});

test('validate reports unknown brands and non-code products', () => {
  assert.equal(validate('nope', 'ABC').errors[0]?.code, 'unknown-brand');
  assert.equal(validate('discord-nitro', 'ABC').errors[0]?.code, 'no-code-product');
});

test('validate accepts a well-formed steam code and rejects a short one', () => {
  assert.equal(validate('steam', 'ABCDE-FGHJK-LMNPQ').valid, true);
  assert.equal(validate('steam', 'ABCDE').valid, false);
});

test('format applies the brand grouping, and is a no-op for ungrouped brands', () => {
  assert.equal(format('steam', 'abcdefghjklmnpq'), 'ABCDE-FGHJK-LMNPQ');
  assert.equal(format('netflix', 'abcdefghjkl'), 'ABCDEFGHJKL');
  assert.equal(format('nope', 'abc'), 'ABC'); // unknown brand still normalizes
});
