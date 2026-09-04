/** What a region lock actually keys on. */
export type LockKey = 'account-country' | 'store-currency' | 'storefront' | 'none';

/** What happens when the card's region and the account's region differ. */
export type MismatchOutcome = 'rejected' | 'accepted' | 'value-differs';

/** canRedeem's verdict. 'ok' means there was no mismatch to begin with. */
export type RedeemOutcome = 'ok' | MismatchOutcome;

/** Derived from Lock.onMismatch; retained so byRegionLock keeps working. */
export type RegionLock = 'strict' | 'loose' | 'none';

export interface Remedy {
  possible: boolean;
  /** True when working around the lock costs the holder something. */
  destructive: boolean;
  note: string;
}

export interface Lock {
  keyedOn: LockKey;
  onMismatch: MismatchOutcome;
  remedy?: Remedy;
  /** The rule in a sentence, for display. */
  note: string;
  source?: string;
  verifiedAt: string;
}

/** How the product reaches the buyer. */
export type DeliveryType =
  /** A redeemable alphanumeric code. */
  | 'code'
  /** A one-time gift URL. */
  | 'gift-link'
  /** Credited straight to an account, no transferable code. */
  | 'account-topup';

export type Category =
  | 'gaming'
  | 'app-store'
  | 'streaming'
  | 'retail'
  | 'subscription';

export interface RegionAvailability {
  /** ISO 3166-1 alpha-2 country code, or "EU" / "GLOBAL". */
  code: string;
  /** ISO 4217 currency code. */
  currency: string;
  /** Face values commonly sold in this region. */
  denominations: number[];
  /** What the denomination buys, when it isn't stored currency value. */
  unit?: 'robux' | 'months' | 'subscription';
}

export interface Brand {
  id: string;
  name: string;
  publisher: string;
  category: Category;
  deliveryType: DeliveryType;
  lock: Lock;
  redeemUrl: string;
  /** Present when deliveryType is 'code', absent otherwise. */
  code?: CodeSpec;
  expires: boolean;
  expiryNote?: string;
  regions: RegionAvailability[];
}

export interface Catalog {
  version: string;
  updated: string;
  disclaimer: string;
  brands: Brand[];
}

export interface RedeemCheck {
  ok: boolean;
  outcome: RedeemOutcome;
  keyedOn: LockKey;
  remedy?: Remedy;
  reason: string;
}

/** Structural description of a brand's redemption code. */
export interface CodeSpec {
  /** Valid total character counts, excluding separators. Always at least one. */
  lengths: number[];
  /** Character counts per display group, e.g. [5,5,5] for XXXXX-XXXXX-XXXXX. */
  groups?: number[];
  /** Separator inserted between groups for display. Defaults to "-". */
  separator?: string;
  /** Literal set of permitted characters. Absent means unverified. */
  alphabet?: string;
  /** Known leading character sequences. */
  prefixes?: string[];
  /** Issuer page the format was taken from. */
  source?: string;
  /** ISO date the claim was last checked. */
  verifiedAt: string;
}

/** Which constraint actually did discriminating work during a match. */
export type MatchSignal = 'prefix' | 'alphabet' | 'length';

export interface SpecMatch {
  /** True when the code's length equals one of the spec's declared lengths. */
  complete: boolean;
  matchedOn: MatchSignal[];
}

export type CodeError =
  | { code: 'unknown-brand'; brandId: string; message: string }
  | { code: 'no-code-product'; brandId: string; message: string }
  | { code: 'length'; expected: number[]; actual: number; message: string }
  | { code: 'alphabet'; invalidChars: string[]; positions: number[]; message: string }
  | { code: 'prefix'; expected: string[]; message: string };

export interface CodeValidation {
  valid: boolean;
  errors: CodeError[];
}

/** One brand a code might belong to. Ranked; ties are genuine ambiguity. */
export interface Detection {
  brandId: string;
  name: string;
  complete: boolean;
  matchedOn: MatchSignal[];
}
