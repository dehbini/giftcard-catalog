# Contributing

The whole point of this repo is that one person shouldn't have to track every issuer's rules alone. Corrections are the most valuable contribution here — more valuable than new code.

## Adding or fixing a brand

1. Edit [`data/brands.json`](data/brands.json).
2. Run `npm test`. The validator prints the exact field and brand that's wrong.
3. Bump `updated` to today's date. Bump `version` if you changed the shape of the data, not just the values.
4. Open a PR. In the description, link the issuer page you got the information from — that's what makes the change reviewable.

### Field rules

- `id` — lowercase kebab-case, stable forever. Renaming an id is a breaking change.
- `lock.note` — write the actual rule in a sentence, not "region locked". Someone debugging a failed redemption should be able to read this line and understand why.
- `lock.keyedOn` / `lock.onMismatch` — what the lock actually keys on, and what happens when it doesn't match. These are what callers branch on, so get them right rather than approximately right.
- `lock` and `code` each take a `verifiedAt` date, and want a `source` link to the issuer page. `source` is optional, but the validator lists every claim without one on each run — a structured field reads as verified, so an unsourced one is worth flagging.
- `code` — include it only when `deliveryType` is `code`. A gift link or an account top-up has no code block at all.
- `denominations` — sorted ascending, positive numbers, in the region's own currency.
- `region.code` — ISO 3166-1 alpha-2, or `EU` for eurozone-wide cards, or `GLOBAL`.
- `redeemUrl` — must be the issuer's official redemption page, over HTTPS.

### Alphabet presets

`code.alphabet` is a literal character list, so any language can read it with
no lookup table. Common starting points — but **verify against the issuer, and
omit the field entirely if you cannot**. An absent alphabet degrades detection
to length and prefix; an invented one produces confidently wrong answers.

- Full uppercase alphanumeric: `ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789`
- Confusables removed (no I, O, 0, 1): `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`
- Digits only: `0123456789`

The validator flags an alphabet that sits one or two characters off one of
these, since that is almost always a dropped letter rather than a real
issuer difference.

## What doesn't belong here

- Prices, exchange rates, or anything that changes daily.
- Affiliate or referral links.
- Reseller-specific stock or availability.
- Scraping code aimed at issuer sites.

The data stays vendor-neutral so anyone can depend on it.

## Not sure?

Open a thread in [Discussions](https://github.com/dehbini/giftcard-catalog/discussions) before writing a PR. "Is this the right shape for X?" is a perfectly good first post.
