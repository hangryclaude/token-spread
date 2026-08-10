/**
 * What backs a finding, from strongest to weakest.
 *
 * Lifted from `docs/research/2026-08-10-strict-identity-register.md`, which adjudicated
 * 176 techniques against one question: does the model read a different sequence of
 * tokens, does a different model answer, or does a different amount of thinking happen?
 *
 * The point of making this a type rather than a doc heading: a saving cannot be reported
 * without declaring what backs it, and the two weakest realities — "the provider says so"
 * and "execution moved fleets" — cannot be silently presented as the strongest.
 *
 * Ordering is load-bearing. Findings sort by it so the strongest evidence leads.
 */
export const EVIDENCE_CLASSES = [
  /** Nothing on the wire changed; only the price, or whether the call was sent at all. */
  "PASS_ABSOLUTE",
  /** Only a non-content field changed — one the model never reads, e.g. `cache_control`. */
  "PASS_METADATA",
  /** Content byte-identical; only *when* requests were sent changed. */
  "PASS_SCHEDULING",
  /** A stored response hash-matches a byte-identical repeat of one logical operation. */
  "PASS_REPLAY",
  /** Provider documents output-neutrality, but execution moved fleets. Never proven. */
  "CONTRACTUAL_ONLY",
] as const;

export type EvidenceClass = (typeof EVIDENCE_CLASSES)[number];

/**
 * True when the claim can be demonstrated without trusting a provider's prose.
 *
 * `PASS_METADATA` and `PASS_SCHEDULING` are deliberately excluded. Anthropic states that
 * prompt caching does not change output, and we believe it — but believing a published
 * sentence is not the same act as verifying a hash, and collapsing the two would launder
 * a documented promise into a measurement.
 */
export function isProvable(c: EvidenceClass): boolean {
  return c === "PASS_ABSOLUTE" || c === "PASS_REPLAY";
}

/**
 * `CONTRACTUAL_ONLY` moves execution to a different fleet or scheduling regime, so
 * byte-identity cannot be proven even in principle. It ships off, per workload, by the
 * customer's choice — never as a default that quietly changes where their traffic runs.
 */
export function shipsByDefault(c: EvidenceClass): boolean {
  return c !== "CONTRACTUAL_ONLY";
}
