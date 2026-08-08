import { expect, test } from "bun:test";
import { RATE_CARD_2026_08_08 as CARD } from "../src/rates";

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

test("covers every model seen in real Claude Code transcripts", () => {
  // Measured 2026-08-08 across ~/.claude/projects. <synthetic> is not a billable
  // model and is deliberately absent — it must stay in the unknown_model bucket.
  for (const model of ["claude-opus-5", "claude-opus-4-8", "claude-sonnet-5", "claude-haiku-4-5-20251001"]) {
    expect(CARD.rates[model], `${model} missing from rate card`).toBeDefined();
  }
  expect(CARD.rates["<synthetic>"]).toBeUndefined();
});
