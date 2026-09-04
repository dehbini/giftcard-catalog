import type { CodeSpec, CodeValidation, Detection } from './types.ts';
import { brands, getBrand } from './catalog.ts';
import { formatSpec, matchSpec, normalize, validateSpec } from './codes.ts';

export type {
  LockKey,
  MismatchOutcome,
  RedeemOutcome,
  RegionLock,
  Remedy,
  Lock,
  DeliveryType,
  Category,
  CodeSpec,
  MatchSignal,
  SpecMatch,
  CodeError,
  CodeValidation,
  Detection,
  RegionAvailability,
  Brand,
  Catalog,
  RedeemCheck,
} from './types.ts';

export {
  brands,
  meta,
  getBrand,
  byCategory,
  byRegionLock,
  regionCodes,
  byRegion,
  denominations,
} from './catalog.ts';

export { canRedeem } from './redeem.ts';

export {
  CONFUSABLE_GROUPS,
  normalize,
  matchSpec,
  validateSpec,
  formatSpec,
} from './codes.ts';

// ---------------------------------------------------------------------------
// Catalog-bound convenience over the pure engine
// ---------------------------------------------------------------------------

interface Ranked extends Detection {
  spec: CodeSpec;
}

/**
 * Ranking, most discriminating first: exact length, then a satisfied prefix
 * requirement, then a narrower alphabet, then brand id for determinism.
 */
function rank(a: Ranked, b: Ranked): number {
  if (a.complete !== b.complete) return a.complete ? -1 : 1;

  const ap = a.matchedOn.includes('prefix');
  const bp = b.matchedOn.includes('prefix');
  if (ap !== bp) return ap ? -1 : 1;

  const aa = a.spec.alphabet?.length ?? Number.POSITIVE_INFINITY;
  const ba = b.spec.alphabet?.length ?? Number.POSITIVE_INFINITY;
  if (aa !== ba) return aa - ba;

  return a.brandId.localeCompare(b.brandId);
}

/**
 * Every brand a code could belong to, best candidate first. Returns an array
 * because gift cards have no IIN registry and no checksum — ambiguity is
 * permanent, and a tie here is the honest answer rather than a defect.
 */
export function detect(code: string): Detection[] {
  if (normalize(code).length === 0) return [];

  const hits: Ranked[] = [];
  for (const brand of brands) {
    const spec = brand.code;
    if (!spec) continue;
    const match = matchSpec(spec, normalize(code, spec));
    if (!match) continue;
    hits.push({
      brandId: brand.id, name: brand.name,
      complete: match.complete, matchedOn: match.matchedOn, spec,
    });
  }

  return hits.sort(rank).map(({ spec: _spec, ...detection }) => detection);
}

/** Checks a code against one brand's format. Never throws. */
export function validate(brandId: string, code: string): CodeValidation {
  const brand = getBrand(brandId);
  if (!brand) {
    return { valid: false, errors: [{ code: 'unknown-brand', brandId, message: `Unknown brand: ${brandId}` }] };
  }
  if (!brand.code) {
    return {
      valid: false,
      errors: [{ code: 'no-code-product', brandId, message: `${brand.name} is delivered as ${brand.deliveryType}, not a code` }],
    };
  }
  return validateSpec(brand.code, code);
}

/** Renders a code with the brand's display grouping. */
export function format(brandId: string, code: string): string {
  const spec = getBrand(brandId)?.code;
  return spec ? formatSpec(spec, code) : normalize(code);
}
