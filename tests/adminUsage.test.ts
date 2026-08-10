import { expect, test } from "bun:test";
import { importAdminUsageReport } from "../src/importers/adminUsageReport";
import { costOfEvent } from "../src/pricing";
import { RATE_CARD_2026_08_08 as CARD } from "../src/rates";
import { USAGE_EVENT_KEYS } from "../src/types";

/**
 * The Admin API's usage report is how a company that does not run Claude Code gets
 * audited: a read-only admin key, no integration, no traffic through us, and no prompt
 * content anywhere in the payload.
 *
 * Shape from /v1/organizations/usage_report/messages, verified 2026-08-11.
 */
const page = (results: unknown[], next: string | null = null) => ({
  data: [{
    starting_at: "2026-08-01T00:00:00Z",
    ending_at: "2026-08-02T00:00:00Z",
    results,
  }],
  has_more: next !== null,
  next_page: next,
});

const RESULT = {
  account_id: "user_01",
  api_key_id: "apikey_01",
  cache_creation: { ephemeral_1h_input_tokens: 1000, ephemeral_5m_input_tokens: 500 },
  cache_read_input_tokens: 200,
  context_window: "0-200k",
  inference_geo: "global",
  model: "claude-opus-5",
  output_tokens: 500,
  server_tool_use: { web_search_requests: 10 },
  service_account_id: null,
  service_tier: "standard",
  uncached_input_tokens: 1500,
  workspace_id: "wrkspc_01",
};

test("maps a usage bucket onto the same event shape as a transcript", () => {
  const r = importAdminUsageReport([page([RESULT])]);
  expect(r.events.length).toBe(1);
  const e = r.events[0];
  expect(e.inputTokens).toBe(1500);            // uncached_input_tokens, not "input_tokens"
  expect(e.cacheReadTokens).toBe(200);
  expect(e.outputTokens).toBe(500);
  expect(e.source).toBe("admin_usage_report");
  expect(e.model).toBe("claude-opus-5");
});

test("carries the cache-write TTL split the report already gives us", () => {
  const r = importAdminUsageReport([page([RESULT])]);
  const e = r.events[0];
  expect(e.cacheCreation1hTokens).toBe(1000);
  expect(e.cacheCreation5mTokens).toBe(500);
  expect(e.cacheCreationTokens).toBe(1500);
});

test("attributes to workspace and account so a report can be split by cost centre", () => {
  const r = importAdminUsageReport([page([RESULT])]);
  expect(r.events[0].projectId).toBe("wrkspc_01");
  expect(r.events[0].accountId).toBe("user_01");
});

test("walks every page", () => {
  const r = importAdminUsageReport([
    page([RESULT], "page_2"),
    page([{ ...RESULT, model: "claude-haiku-4-5", workspace_id: "wrkspc_02" }]),
  ]);
  expect(r.events.length).toBe(2);
  expect(r.events.map((e) => e.projectId).sort()).toEqual(["wrkspc_01", "wrkspc_02"]);
});

test("keys are deterministic, so re-importing the same window does not double-count", () => {
  const a = importAdminUsageReport([page([RESULT])]);
  const seen = new Set(a.events.map((e) => e.idempotencyKey));
  const b = importAdminUsageReport([page([RESULT])], { seen });
  expect(b.events.length).toBe(0);
  expect(b.provenance.deduped).toBe(1);
});

test("two groups inside one bucket are two events, not one", () => {
  const r = importAdminUsageReport([page([
    RESULT,
    { ...RESULT, model: "claude-haiku-4-5" },
  ])]);
  expect(r.events.length).toBe(2);
  expect(new Set(r.events.map((e) => e.idempotencyKey)).size).toBe(2);
});

test("carries no key outside the event schema", () => {
  const r = importAdminUsageReport([page([RESULT])]);
  expect(Object.keys(r.events[0]).sort()).toEqual([...USAGE_EVENT_KEYS].sort());
});

test("batch traffic is billed at the documented 50% discount", () => {
  // Anthropic: "The Batch API allows asynchronous processing of large volumes of requests
  // with a 50% discount on both input and output tokens." Pricing batch at standard rates
  // would overstate a batch-heavy org's bill by 2x.
  const std = importAdminUsageReport([page([RESULT])]).events[0];
  const batch = importAdminUsageReport([page([{ ...RESULT, service_tier: "batch" }])]).events[0];
  const a = costOfEvent(std, CARD);
  const b = costOfEvent(batch, CARD);
  expect(a.ok && b.ok).toBe(true);
  if (a.ok && b.ok) expect(b.microCents).toBe(Math.floor(a.microCents / 2));
});

test("an unpriceable service tier is refused, not guessed", () => {
  // flex, priority and the rest have no published multiplier. Guessing one is how a
  // report ends up confidently wrong.
  const e = importAdminUsageReport([page([{ ...RESULT, service_tier: "priority" }])]).events[0];
  const r = costOfEvent(e, CARD);
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.reason).toBe("unknown_tier");
});

test("a malformed result is bucketed, not thrown", () => {
  const r = importAdminUsageReport([page([
    RESULT,
    { ...RESULT, uncached_input_tokens: -1 },
    { ...RESULT, model: null },
  ])]);
  expect(r.events.length).toBe(1);
  expect(r.provenance.malformed).toBe(2);
});
