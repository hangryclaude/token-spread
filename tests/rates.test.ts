import { expect, test } from "bun:test";
import { RATE_CARD_2026_08_08 as CARD, lapsesDue } from "../src/rates";

test("every rate is a non-negative integer in micro-cents", () => {
  for (const [model, r] of Object.entries(CARD.rates)) {
    for (const [field, v] of Object.entries(r)) {
      expect(Number.isInteger(v), `${model}.${field} = ${v}`).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
    }
  }
});

test("derived cache rates divide exactly — no silent rounding", () => {
  for (const [model, r] of Object.entries(CARD.rates)) {
    expect(r.input * 10 % 100, `${model} cacheRead`).toBe(0);
    expect(r.input * 125 % 100, `${model} cacheWrite`).toBe(0);
    expect(r.cacheRead).toBe(r.input * 10 / 100);
    expect(r.cacheWrite).toBe(r.input * 125 / 100);
  }
});

test("opus input is 500 micro-cents per token", () => {
  // $5.00 per MTok = 500 cents per 1e6 tokens = 500 micro-cents per token
  expect(CARD.rates["claude-opus-5"].input).toBe(500);
});

test("card is dated", () => {
  expect(CARD.capturedAt).toBe("2026-08-08");
});

test("the dated haiku id prices identically to its alias", () => {
  // Real transcripts carry claude-haiku-4-5-20251001; the two must never diverge,
  // or the same traffic is priced differently depending on which id it recorded.
  expect(CARD.rates["claude-haiku-4-5-20251001"]).toEqual(CARD.rates["claude-haiku-4-5"]);
});

// ── dated rates ────────────────────────────────────────────────────────────────
// This card carried Sonnet 5 at its POST-lapse $3/$15 until 2026-08-11, while its own
// note said intro pricing was in force. That over-states Sonnet cost by 50% — and every
// saving measured against it by the same margin. No test asserted a dollar value, so
// nothing caught it. These do.

test("sonnet 5 is priced at the rate in force on the card's capture date", () => {
  // Captured 2026-08-08, inside the introductory window that runs through 2026-08-31.
  // $2/$10 per MTok => 200/1000 micro-cents per token.
  const r = CARD.rates["claude-sonnet-5"];
  expect(r.input).toBe(200);
  expect(r.output).toBe(1000);
});

test("every rate is the one in force on capturedAt, not a future one", () => {
  // A card is a snapshot. Pricing tomorrow's rate today is the same class of error as
  // pricing yesterday's, and is harder to notice because the card looks fresh.
  const captured = Date.parse(CARD.capturedAt + "T00:00:00Z");
  for (const l of CARD.lapses ?? []) {
    expect(Date.parse(l.on + "T00:00:00Z"), `${l.what} lapses before the card was captured`)
      .toBeGreaterThan(captured);
  }
});

/*
 * lapsesDue is exercised against a synthetic card rather than the real one. The real card's
 * only lapse — the Sonnet 5 rise to $3/$15 — was CANCELLED by Anthropic, not served, so
 * asserting the function's behaviour through it would tie a correct piece of logic to a fact
 * that stopped being true. The behaviour still needs testing; it just must not be tested
 * through data that moves for unrelated reasons.
 */
const SYNTHETIC = {
  ...CARD,
  lapses: [{ on: "2026-09-01", what: "a scheduled rise, for testing the reporting logic only" }],
};

test("a scheduled lapse is reported before it lands", () => {
  const due = lapsesDue(SYNTHETIC, new Date("2026-08-11T00:00:00Z"));
  expect(due.length).toBe(1);
  expect(due[0].on).toBe("2026-09-01");
  expect(due[0].daysAway).toBe(21);
});

test("a lapse that has already passed reports as negative, not as absent", () => {
  // The failure this guards: a card that is only days old, and already wrong.
  const due = lapsesDue(SYNTHETIC, new Date("2026-09-05T00:00:00Z"));
  expect(due.length).toBe(1);
  expect(due[0].daysAway).toBeLessThan(0);
});

test("a lapse far in the future is not yet noise", () => {
  expect(lapsesDue(SYNTHETIC, new Date("2026-06-01T00:00:00Z")).length).toBe(0);
});

test("the card announces no price change that has been called off", () => {
  // Until 2026-08-12 this card warned every reader that Sonnet 5 was about to cost 50% more.
  // Anthropic's pricing page says the increase "will not occur". A tool that sells traceable
  // figures cannot be the one telling a buyer to budget for a rise that was cancelled.
  const cancelled = (CARD.lapses ?? []).filter((l) => /sonnet-5.*\$3/.test(l.what));
  expect(cancelled, "the cancelled Sonnet 5 rise is back on the card").toEqual([]);
  expect(lapsesDue(CARD, new Date("2026-08-12T00:00:00Z")).length).toBe(0);
});

test("covers every model seen in real Claude Code transcripts", () => {
  // Measured 2026-08-08 across ~/.claude/projects; claude-fable-5 first appeared 2026-08-12.
  // <synthetic> is not a billable model and is deliberately absent — it must stay in the
  // unknown_model bucket.
  for (const model of ["claude-opus-5", "claude-opus-4-8", "claude-sonnet-5", "claude-fable-5", "claude-haiku-4-5-20251001"]) {
    expect(CARD.rates[model], `${model} missing from rate card`).toBeDefined();
  }
  expect(CARD.rates["<synthetic>"]).toBeUndefined();
});

test("fable 5 is priced at exactly five times sonnet 5, on every field", () => {
  // $10/$50 against $2/$10, read from the pricing page 2026-08-12. Asserting the RATIO as well
  // as the absolute pins both models: if either moves and the other does not, this fails and
  // forces a re-read of the source rather than a one-sided edit.
  const f = CARD.rates["claude-fable-5"], s = CARD.rates["claude-sonnet-5"];
  expect(f.input).toBe(1000);
  expect(f.output).toBe(5000);
  for (const k of ["input", "output", "cacheRead", "cacheWrite", "cacheWrite1h"] as const) {
    expect(f[k], `fable ${k} is not 5x sonnet`).toBe(5 * s[k]);
  }
});
