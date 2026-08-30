/**
 * What both importers need and would otherwise each define their own copy of. `TIERS` and
 * `isCount` disagreeing between `claudeCode.ts` and `adminUsageReport.ts` would mean the
 * same `service_tier` string, or the same malformed count, is accepted from one source and
 * refused from the other — a split nobody would notice until a report from each disagreed.
 */

/** Every billing tier a source can report. Kept as a runtime list because `ServiceTier` is
 * a type, and validating an unknown string against it needs a value to check membership in. */
export const TIERS: readonly string[] = [
  "standard", "batch", "flex", "flex_discount", "priority", "priority_on_demand",
];

export const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;
