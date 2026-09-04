# giftcard-catalog

[![CI](https://github.com/dehbini/giftcard-catalog/actions/workflows/ci.yml/badge.svg)](https://github.com/dehbini/giftcard-catalog/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/giftcard-catalog.svg)](https://www.npmjs.com/package/giftcard-catalog)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Identify, validate and format digital gift card codes — plus an open, machine-readable catalog of the brands behind them: regions, currencies, denominations, and the region-lock rules that decide whether a code will actually redeem.

Zero dependencies. The data is plain JSON you can consume from any language.

> **Why this exists.** Hand a support form a gift card code and the fiddly part isn't the lookup — it's everything before it. Which brand is this? Did the user type an `O` where the alphabet only has `0`? Is it even the right length to be worth an API call? Every team rebuilds that table from a dozen support pages that change quietly. This repo puts it in one versioned file.

## Install

```bash
npm install giftcard-catalog
```

Or skip the package and just take the data:

```bash
curl -O https://raw.githubusercontent.com/dehbini/giftcard-catalog/main/data/brands.json
```

## Usage

```ts
import { detect, validate, format, canRedeem } from 'giftcard-catalog';

detect('XABC-DEFG-HJKL-MNPQ')[0];
// → { brandId: 'apple', name: 'Apple Gift Card', complete: true, matchedOn: ['prefix', 'length'] }

validate('steam', 'ABCDE-FGHJK-LMNPQ');
// → { valid: true, errors: [] }

validate('steam', 'ABCDE');
// → { valid: false, errors: [{ code: 'length', expected: [15], actual: 5, message: 'expected 15 characters, got 5' }] }

format('steam', 'abcdefghjklmnpq');
// → 'ABCDE-FGHJK-LMNPQ'

canRedeem('apple', 'US', 'GB');
// → { ok: false, outcome: 'rejected', keyedOn: 'account-country', reason: 'Must match the country of the Apple Account…' }

canRedeem('roblox', 'US', 'GB');
// → { ok: true, outcome: 'value-differs', keyedOn: 'none', reason: 'Robux value is credited globally, but…' }
```

`detect` returns an **array**, best candidate first. Gift cards have no IIN registry and no checksum, so ambiguity is permanent: three brands in this catalog declare 16-character codes and only Apple's `X` prefix tells them apart. A tie in the results is the honest answer, not a defect — which is also why there's no confidence score. `matchedOn` tells you which constraints actually did the work.

### API

**Codes**

| Function | Returns |
| --- | --- |
| `detect(code)` | Ranked `Detection[]` — every brand the code could belong to |
| `validate(id, code)` | `{ valid, errors }` with structured `CodeError`s, not prose |
| `format(id, code)` | The code with the brand's display grouping |
| `normalize(code, spec?)` | Separators stripped, uppercased, confusables resolved |
| `matchSpec(spec, code)` | `SpecMatch \| null` — the pure engine, no catalog needed |
| `validateSpec(spec, code)` | As `validate`, against a spec you supply |
| `formatSpec(spec, code)` | As `format`, against a spec you supply |

**Catalog**

| Function | Returns |
| --- | --- |
| `brands` | Every brand in the catalog |
| `meta` | Catalog version, last-updated date, disclaimer |
| `getBrand(id)` | One brand, or `undefined` |
| `byCategory(category)` | Brands in `gaming`, `app-store`, `streaming`, `retail`, `subscription` |
| `byRegion(code)` | Brands sold in a region, with that region's availability attached |
| `byRegionLock(lock)` | Brands matching `strict`, `loose`, or `none` |
| `denominations(id, region)` | Face values commonly sold |
| `canRedeem(id, cardRegion, accountRegion)` | `{ ok, outcome, keyedOn, remedy?, reason }` |
| `regionCodes()` | Every region code present in the data |

Every function is total — nothing throws, for any input. An unknown brand comes back as an empty result or a structured error.

## Data shape

Each brand in [`data/brands.json`](data/brands.json):

```jsonc
{
  "id": "apple",
  "name": "Apple Gift Card",
  "publisher": "Apple",
  "category": "app-store",
  "deliveryType": "code",          // code | gift-link | account-topup
  "lock": {
    "keyedOn": "account-country",  // account-country | store-currency | storefront | none
    "onMismatch": "rejected",      // rejected | accepted | value-differs
    "note": "Must match the country of the Apple Account…",
    "verifiedAt": "2026-09-03"
  },
  "redeemUrl": "https://apps.apple.com/redeem",
  "code": {                        // present only when deliveryType is "code"
    "lengths": [16],
    "groups": [4, 4, 4, 4],
    "prefixes": ["X"],
    "verifiedAt": "2026-09-03"
  },
  "expires": false,
  "regions": [
    { "code": "US", "currency": "USD", "denominations": [10, 15, 25, 50, 100, 200] }
  ]
}
```

Inside `code`, only `lengths` and `verifiedAt` are required. `alphabet` — the literal set of permitted characters — is **absent when we haven't verified it**, and that's deliberate: detection degrades to length and prefix, which is better than inventing a plausible-looking alphabet and answering confidently wrong. When an alphabet *is* present, it also drives confusable resolution for free: if it contains `0` and not `O`, a typed `O` becomes `0`; if it contains both, neither is touched.

`region.code` is ISO 3166-1 alpha-2, or `EU` / `GLOBAL`. `currency` is ISO 4217. A JSON Schema lives in [`schema/brand.schema.json`](schema/brand.schema.json), and [`scripts/validate.mjs`](scripts/validate.mjs) enforces it in CI on every pull request — along with informational reports for unsourced claims, brand pairs `detect` can't tell apart, and claims that have gone a year without verification.

## What this deliberately does not do

There is no code generator, no checksum forger, and no helper that makes it easier to probe a redemption endpoint. Format *validation* is defensive — it is what a redeem form uses to fail fast before spending an API call. Format *generation* is card-cracking tooling, and it is out of scope permanently.

## Migrating from 0.1.x

| 0.1.x | 0.2.0 |
| --- | --- |
| `codeFormat` | `code`, absent unless `deliveryType === 'code'` |
| `codeFormat.length` | `code.lengths[]` |
| `codeFormat.grouping: "5-5-5"` | `code.groups: [5,5,5]` |
| `codeFormat.charset: "alphanumeric"` | `code.alphabet`, explicit or absent |
| `codeFormat.prefix` | `code.prefixes[]` |
| `regionLock` | `lock.onMismatch` (`byRegionLock` still derives the old values) |
| `regionLockNote` | `lock.note` |

`canRedeem` keeps `ok` and `reason` and gains `outcome`, `keyedOn` and an optional `remedy`.

## Accuracy

This is community-maintained reference data, not a contract. Denominations get added and retired, and issuers change redemption rules without announcing them. **Verify against the issuer before you rely on this in production.** If you spot something stale, a one-line PR fixing it is genuinely welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

## Contributing

Adding a brand or a region is a single JSON edit. Run `npm test` before opening a PR; the validator will tell you exactly what's wrong.

Questions, corrections, or a region you want covered? Open a thread in [Discussions](https://github.com/dehbini/giftcard-catalog/discussions).

## Roadmap

- [ ] Verified alphabets and sources for the brands that have none — the validator lists them on every run
- [ ] More regions per brand (currently US/EU/GB/TR/AE-heavy)
- [ ] `remedy` data: which locks have a workaround, and what it costs you

## Who maintains this

Maintained by the team behind [Gifteto](https://gifteto.com) — we sell digital gift cards, so we keep this table current because we have to. The data is MIT-licensed and vendor-neutral: no affiliate links, no pricing, no API keys.

## License

[MIT](LICENSE). The data file is yours to use, fork, and redistribute.
