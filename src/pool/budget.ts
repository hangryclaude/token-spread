import type { BudgetDecision, PoolAction, PoolMember } from "./types";

/**
 * The budget gate (spec §5). Prepay only — this never extends debt, it only decides
 * what to alert and whether to kill the key. Pure: the shell sends alerts and
 * deactivates keys; this function just looks at one snapshot and reports what it sees.
 */
export function budgetDecision(input: {
  memberId: string;
  creditedMicroCents: number;
  consumedMicroCents: number;
  reserveMicroCents: number;
  alreadyAlertedPcts: readonly number[];
  thresholds: readonly number[];
}): BudgetDecision {
  const { memberId, creditedMicroCents, consumedMicroCents, reserveMicroCents, alreadyAlertedPcts, thresholds } = input;

  const balanceMicroCents = creditedMicroCents - consumedMicroCents;
  const spendableMicroCents = balanceMicroCents - reserveMicroCents;
  const hardCap = spendableMicroCents <= 0;

  // Integer basis points; a member with zero credit is defined as 100% consumed
  // (hardCap already covers them via spendable <= 0, this just makes the share honest).
  const shareBps = creditedMicroCents > 0
    ? Math.floor(consumedMicroCents * 10_000 / creditedMicroCents)
    : 10_000;

  const alreadySet = new Set(alreadyAlertedPcts);
  const newAlertPcts = thresholds
    .filter((t) => shareBps >= t * 100 && !alreadySet.has(t))
    .slice()
    .sort((a, b) => a - b);

  return {
    memberId,
    creditedMicroCents,
    consumedMicroCents,
    balanceMicroCents,
    reserveMicroCents,
    spendableMicroCents,
    newAlertPcts,
    hardCap,
  };
}

/**
 * One alert per newly-crossed threshold (ascending, as budgetDecision already sorted
 * them), then a deactivation iff hardCap. Emitted every look while hardCapped — the
 * shell dedups by key state, so re-asking to kill a dead key is safe.
 */
export function actionsFromDecision(d: BudgetDecision, member: PoolMember): PoolAction[] {
  const actions: PoolAction[] = d.newAlertPcts.map((pct) => ({
    type: "alert" as const,
    memberId: d.memberId,
    pct,
    spendableMicroCents: d.spendableMicroCents,
  }));

  if (d.hardCap) {
    actions.push({ type: "deactivate_key", memberId: d.memberId, apiKeyId: member.apiKeyId });
  }

  return actions;
}
