import type {
  CodeError, CodeSpec, CodeValidation, MatchSignal, SpecMatch,
} from './types.ts';

/**
 * Characters users routinely mistype for one another. Exported so the
 * substitution behaviour is reviewable rather than buried.
 */
export const CONFUSABLE_GROUPS: readonly string[] = ['O0', 'I1L', 'S5', 'B8', 'Z2', 'G6'];

const SEPARATORS = /[\s\-–]/g;

/**
 * Strips separators and uppercases. With a spec, additionally resolves a
 * confusable character when — and only when — exactly one member of its
 * group is in the alphabet. Ambiguous cases are left for validateSpec to flag.
 */
export function normalize(code: string, spec?: CodeSpec): string {
  const stripped = code.replace(SEPARATORS, '').toUpperCase();
  const alphabet = spec?.alphabet;
  if (!alphabet) return stripped;

  let out = '';
  for (const ch of stripped) {
    if (alphabet.includes(ch)) { out += ch; continue; }
    const group = CONFUSABLE_GROUPS.find((g) => g.includes(ch));
    if (!group) { out += ch; continue; }
    const inAlphabet = [...group].filter((c) => alphabet.includes(c));
    const [only] = inAlphabet;
    out += inAlphabet.length === 1 && only ? only : ch;
  }
  return out;
}

/**
 * Gates a normalized code against a spec. Returns null on any failure, so a
 * caller can treat it as a filter. Partial codes are live candidates.
 */
export function matchSpec(spec: CodeSpec, code: string): SpecMatch | null {
  if (code.length === 0 || code.length > Math.max(...spec.lengths)) return null;

  const matchedOn: MatchSignal[] = [];

  const prefixes = spec.prefixes ?? [];
  if (prefixes.length > 0) {
    // Either the full prefix is typed, or the user is partway through it.
    const hit = prefixes.some((p) => code.startsWith(p) || p.startsWith(code));
    if (!hit) return null;
    matchedOn.push('prefix');
  }

  const { alphabet } = spec;
  if (alphabet) {
    for (const ch of code) if (!alphabet.includes(ch)) return null;
    matchedOn.push('alphabet');
  }

  const complete = spec.lengths.includes(code.length);
  if (complete) matchedOn.push('length');

  return { complete, matchedOn };
}

/** Checks a code against a spec, reporting every problem rather than the first. */
export function validateSpec(spec: CodeSpec, code: string): CodeValidation {
  const norm = normalize(code, spec);
  const errors: CodeError[] = [];

  if (!spec.lengths.includes(norm.length)) {
    errors.push({
      code: 'length', expected: spec.lengths, actual: norm.length,
      message: `expected ${spec.lengths.join(' or ')} characters, got ${norm.length}`,
    });
  }

  const { alphabet } = spec;
  if (alphabet) {
    const invalidChars: string[] = [];
    const positions: number[] = [];
    [...norm].forEach((ch, i) => {
      if (!alphabet.includes(ch)) { invalidChars.push(ch); positions.push(i); }
    });
    if (invalidChars.length > 0) {
      errors.push({
        code: 'alphabet', invalidChars, positions,
        message: `invalid character(s) ${[...new Set(invalidChars)].join(', ')}`,
      });
    }
  }

  const prefixes = spec.prefixes ?? [];
  if (prefixes.length > 0 && !prefixes.some((p) => norm.startsWith(p))) {
    errors.push({
      code: 'prefix', expected: prefixes,
      message: `expected the code to start with ${prefixes.join(' or ')}`,
    });
  }

  return { valid: errors.length === 0, errors };
}

/** Renders a code with its display grouping, for showing back to a user. */
export function formatSpec(spec: CodeSpec, code: string): string {
  const norm = normalize(code, spec);
  const groups = spec.groups;
  if (!groups || groups.length === 0) return norm;

  const separator = spec.separator ?? '-';
  const parts: string[] = [];
  let i = 0;
  for (const size of groups) {
    parts.push(norm.slice(i, i + size));
    i += size;
  }
  if (i < norm.length) parts.push(norm.slice(i)); // keep overlong input visible
  return parts.filter((p) => p.length > 0).join(separator);
}
