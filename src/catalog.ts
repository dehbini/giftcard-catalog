import { createRequire } from 'node:module';
import type {
  Brand,
  Catalog,
  Category,
  RegionAvailability,
  RegionLock,
} from './types.ts';

const require = createRequire(import.meta.url);
const catalog = require('../data/brands.json') as Catalog;

/** Every brand in the catalog. */
export const brands: Brand[] = catalog.brands;

/** Catalog metadata: version, last-updated date, disclaimer. */
export const meta = {
  version: catalog.version,
  updated: catalog.updated,
  disclaimer: catalog.disclaimer,
};

/** Look up a single brand by its id, e.g. `getBrand('steam')`. */
export function getBrand(id: string): Brand | undefined {
  return brands.find((b) => b.id === id);
}

/** All brands in a category. */
export function byCategory(category: Category): Brand[] {
  return brands.filter((b) => b.category === category);
}

/**
 * Derives the pre-0.2.0 strict/loose/none classification from the lock model,
 * so this lookup survives the data restructure.
 */
function classify(brand: Brand): RegionLock {
  switch (brand.lock.onMismatch) {
    case 'rejected': return 'strict';
    case 'value-differs': return 'loose';
    case 'accepted': return 'none';
  }
}

/** All brands with a given region-lock strictness. */
export function byRegionLock(lock: RegionLock): Brand[] {
  return brands.filter((b) => classify(b) === lock);
}

/** Sorted list of every region code that appears in the catalog. */
export function regionCodes(): string[] {
  const set = new Set<string>();
  for (const b of brands) for (const r of b.regions) set.add(r.code);
  return [...set].sort();
}

/**
 * Every brand sold in a region, with that region's currency and denominations
 * attached. Brands published globally are always included.
 */
export function byRegion(
  regionCode: string,
): Array<Brand & { availability: RegionAvailability }> {
  const code = regionCode.toUpperCase();
  const out: Array<Brand & { availability: RegionAvailability }> = [];
  for (const brand of brands) {
    const availability =
      brand.regions.find((r) => r.code === code) ??
      brand.regions.find((r) => r.code === 'GLOBAL');
    if (availability) out.push({ ...brand, availability });
  }
  return out;
}

/** Face values commonly sold for a brand in a region. */
export function denominations(brandId: string, regionCode: string): number[] {
  const brand = getBrand(brandId);
  if (!brand) return [];
  const code = regionCode.toUpperCase();
  const region =
    brand.regions.find((r) => r.code === code) ??
    brand.regions.find((r) => r.code === 'GLOBAL');
  return region ? [...region.denominations] : [];
}
