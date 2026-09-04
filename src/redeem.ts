import type { RedeemCheck, RedeemOutcome } from './types.ts';
import { getBrand } from './catalog.ts';

/**
 * Whether a card bought in one region redeems on an account registered in
 * another. `outcome` is what a caller should branch on; `reason` is for display.
 *
 * ```ts
 * canRedeem('apple', 'US', 'GB').outcome   // 'rejected'      — country-locked
 * canRedeem('roblox', 'US', 'GB').outcome  // 'value-differs' — redeems, rate varies
 * ```
 */
export function canRedeem(
  brandId: string,
  cardRegion: string,
  accountRegion: string,
): RedeemCheck {
  const brand = getBrand(brandId);
  if (!brand) {
    return {
      ok: false, outcome: 'rejected', keyedOn: 'none',
      reason: `Unknown brand: ${brandId}`,
    };
  }

  const from = cardRegion.toUpperCase();
  const to = accountRegion.toUpperCase();
  const { keyedOn, onMismatch, remedy, note } = brand.lock;

  const matched = from === to || from === 'GLOBAL';
  const outcome: RedeemOutcome = matched ? 'ok' : onMismatch;

  return {
    ok: outcome !== 'rejected',
    outcome,
    keyedOn,
    ...(remedy ? { remedy } : {}),
    reason: matched ? 'Card region matches the account region.' : note,
  };
}
