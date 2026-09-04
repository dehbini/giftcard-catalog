#!/usr/bin/env node
// Dependency-free validator for data/brands.json.
// Runs in CI on every pull request so bad contributions fail fast.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(readFileSync(join(root, 'data/brands.json'), 'utf8'));

const CATEGORIES = ['gaming', 'app-store', 'streaming', 'retail', 'subscription'];
const KEYED_ON = ['account-country', 'store-currency', 'storefront', 'none'];
const ON_MISMATCH = ['rejected', 'accepted', 'value-differs'];
const isIsoDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s ?? '') && !Number.isNaN(Date.parse(s));
const today = new Date().toISOString().slice(0, 10);
const DELIVERY = ['code', 'gift-link', 'account-topup'];

const errors = [];
const seen = new Set();

const req = (cond, msg) => { if (!cond) errors.push(msg); };

req(Array.isArray(catalog.brands) && catalog.brands.length > 0, 'brands must be a non-empty array');
req(/^\d+\.\d+\.\d+$/.test(catalog.version ?? ''), 'version must be semver');
req(/^\d{4}-\d{2}-\d{2}$/.test(catalog.updated ?? ''), 'updated must be YYYY-MM-DD');

for (const b of catalog.brands ?? []) {
  const at = `brand "${b.id ?? '(missing id)'}"`;
  req(/^[a-z0-9-]+$/.test(b.id ?? ''), `${at}: id must be lowercase kebab-case`);
  req(!seen.has(b.id), `${at}: duplicate id`);
  seen.add(b.id);

  req(typeof b.name === 'string' && b.name.length > 0, `${at}: name is required`);
  req(typeof b.publisher === 'string' && b.publisher.length > 0, `${at}: publisher is required`);
  req(CATEGORIES.includes(b.category), `${at}: category must be one of ${CATEGORIES.join(', ')}`);
  req(DELIVERY.includes(b.deliveryType), `${at}: deliveryType must be one of ${DELIVERY.join(', ')}`);

  // --- lock ---
  const lock = b.lock ?? {};
  req(KEYED_ON.includes(lock.keyedOn), `${at}: lock.keyedOn must be one of ${KEYED_ON.join(', ')}`);
  req(ON_MISMATCH.includes(lock.onMismatch), `${at}: lock.onMismatch must be one of ${ON_MISMATCH.join(', ')}`);
  req(typeof lock.note === 'string' && lock.note.length > 10, `${at}: lock.note must explain the rule`);
  req(isIsoDate(lock.verifiedAt), `${at}: lock.verifiedAt must be YYYY-MM-DD`);
  req(!lock.verifiedAt || lock.verifiedAt <= today, `${at}: lock.verifiedAt is in the future`);
  req(!lock.source || /^https:\/\//.test(lock.source), `${at}: lock.source must be https`);

  // --- code presence is biconditional with deliveryType ---
  const hasCode = b.code !== undefined;
  req(hasCode === (b.deliveryType === 'code'),
    `${at}: deliveryType "${b.deliveryType}" ${b.deliveryType === 'code' ? 'requires' : 'must not have'} a code block`);

  if (hasCode) {
    const c = b.code;
    const cat = `${at} code`;
    req(Array.isArray(c.lengths) && c.lengths.length > 0 && c.lengths.every((n) => Number.isInteger(n) && n > 0),
      `${cat}: lengths must be a non-empty array of positive integers`);
    req(isIsoDate(c.verifiedAt), `${cat}: verifiedAt must be YYYY-MM-DD`);
    req(!c.verifiedAt || c.verifiedAt <= today, `${cat}: verifiedAt is in the future`);
    req(!c.source || /^https:\/\//.test(c.source), `${cat}: source must be https`);

    if (Array.isArray(c.groups)) {
      const sum = c.groups.reduce((a, n) => a + n, 0);
      req((c.lengths ?? []).includes(sum), `${cat}: groups sum to ${sum}, which is not one of lengths ${(c.lengths ?? []).join(', ')}`);
    }
    if (typeof c.alphabet === 'string') {
      req(c.alphabet.length > 0, `${cat}: alphabet must not be empty`);
      req(c.alphabet === c.alphabet.toUpperCase(), `${cat}: alphabet must be uppercase`);
      req(new Set(c.alphabet).size === c.alphabet.length, `${cat}: alphabet has duplicate characters`);
      for (const p of c.prefixes ?? []) {
        req([...p].every((ch) => c.alphabet.includes(ch)), `${cat}: prefix "${p}" uses characters outside the alphabet`);
      }
    }
  }
  req(/^https:\/\//.test(b.redeemUrl ?? ''), `${at}: redeemUrl must be https`);
  req(typeof b.expires === 'boolean', `${at}: expires must be a boolean`);
  if (b.expires) req(typeof b.expiryNote === 'string', `${at}: expires:true needs an expiryNote`);

  req(Array.isArray(b.regions) && b.regions.length > 0, `${at}: needs at least one region`);
  for (const r of b.regions ?? []) {
    const rat = `${at} region "${r.code}"`;
    req(/^([A-Z]{2}|EU|GLOBAL)$/.test(r.code ?? ''), `${rat}: code must be ISO-3166 alpha-2, EU or GLOBAL`);
    req(/^[A-Z]{3}$/.test(r.currency ?? ''), `${rat}: currency must be ISO-4217`);
    req(Array.isArray(r.denominations) && r.denominations.length > 0, `${rat}: needs denominations`);
    req((r.denominations ?? []).every((d) => typeof d === 'number' && d > 0), `${rat}: denominations must be positive numbers`);
    const sorted = [...(r.denominations ?? [])].sort((a, c) => a - c);
    req(JSON.stringify(sorted) === JSON.stringify(r.denominations), `${rat}: denominations must be sorted ascending`);
  }
}

// --- Informational: claims with no source -------------------------------
const unsourced = [];
for (const b of catalog.brands ?? []) {
  if (!b.lock?.source) unsourced.push(`${b.id} (lock)`);
  if (b.code && !b.code.source) unsourced.push(`${b.id} (code)`);
}
if (unsourced.length) {
  console.log(`\n○ ${unsourced.length} unsourced claim(s) — a structured field reads as verified, so these want an issuer link:`);
  for (const u of unsourced) console.log('  - ' + u);
}

// --- Informational: mutually indistinguishable brands --------------------
const STALE_DAYS = 365;
const withCode = (catalog.brands ?? []).filter((b) => b.code);
const ambiguous = [];
for (let i = 0; i < withCode.length; i++) {
  for (let j = i + 1; j < withCode.length; j++) {
    const a = withCode[i], b = withCode[j];
    // Overlapping declared lengths?
    if (!a.code.lengths.some((n) => b.code.lengths.includes(n))) continue;
    // A prefix requirement on either side discriminates them.
    if ((a.code.prefixes?.length ?? 0) > 0 || (b.code.prefixes?.length ?? 0) > 0) continue;
    // Disjoint alphabets discriminate them; a missing alphabet cannot.
    const aa = a.code.alphabet, ba = b.code.alphabet;
    if (aa && ba && ![...aa].some((ch) => ba.includes(ch))) continue;
    ambiguous.push(`${a.id} / ${b.id}  (both ${a.code.lengths.filter((n) => b.code.lengths.includes(n)).join(', ')} chars)`);
  }
}
if (ambiguous.length) {
  console.log(`\n○ ${ambiguous.length} indistinguishable brand pair(s) — detect() cannot separate these; a prefix or alphabet would:`);
  for (const p of ambiguous) console.log('  - ' + p);
}

// --- Informational: alphabet near-misses ---------------------------------
// A submitted alphabet one or two characters off a common preset is almost
// always a dropped letter rather than a real issuer difference.
const PRESETS = {
  'alphanumeric': 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
  'no-confusables': 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
  'digits': '0123456789',
};
const nearMiss = [];
for (const b of catalog.brands ?? []) {
  const alpha = b.code?.alphabet;
  if (!alpha) continue;
  for (const [name, preset] of Object.entries(PRESETS)) {
    if (alpha === preset) break; // exact match is not a near miss
    const missing = [...preset].filter((c) => !alpha.includes(c));
    const extra = [...alpha].filter((c) => !preset.includes(c));
    const diff = missing.length + extra.length;
    if (diff > 0 && diff <= 2) {
      nearMiss.push(`${b.id}: alphabet is ${diff} character(s) off the "${name}" preset — missing [${missing.join('')}], extra [${extra.join('')}]`);
    }
  }
}
if (nearMiss.length) {
  console.log(`\n○ ${nearMiss.length} alphabet(s) close to a preset — check for a typo:`);
  for (const n of nearMiss) console.log('  - ' + n);
}

// --- Informational: stale claims ----------------------------------------
const stale = [];
const cutoff = Date.now() - STALE_DAYS * 86_400_000;
for (const b of catalog.brands ?? []) {
  if (b.lock?.verifiedAt && Date.parse(b.lock.verifiedAt) < cutoff) stale.push(`${b.id} (lock, ${b.lock.verifiedAt})`);
  if (b.code?.verifiedAt && Date.parse(b.code.verifiedAt) < cutoff) stale.push(`${b.id} (code, ${b.code.verifiedAt})`);
}
if (stale.length) {
  console.log(`\n○ ${stale.length} claim(s) unverified for over a year:`);
  for (const s of stale) console.log('  - ' + s);
}

if (errors.length) {
  console.error(`✗ ${errors.length} validation error(s):\n`);
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}

console.log(`✓ ${catalog.brands.length} brands valid (catalog v${catalog.version}, updated ${catalog.updated})`);
