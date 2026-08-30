# token-spread slice 2 — the pool ledger (design only)

Status: **DESIGN ONLY.** Nothing here provisions accounts, sends invites, moves money,
deploys, or commits. Written 2026-08-30 against `feat/slice-1-savings-report`.

The ask it answers: *"3–5 people pay $20 each into a shared arrangement and get more
out of it, divided equally."* The subscription version of that is account sharing —
banned, and repriced to zero margin (register context, June 2026). This spec designs
the only lawful shape: one API organization, individual credentials, a ledger.

---

## 0. The economics, measured — the hypothesis is dead for heavy users

The pitch assumed API pooling beats subscriptions. Measured on this machine
(slice-1 CLI, run 2026-08-30, rate card 2026-08-08):

| Measured | Value |
|---|---|
| API-equivalent cost, last ~26 days of transcripts (Aug 4–30) | **$8,100.09** |
| Priced tokens | 11.29B (96.4% cache reads) |
| Blended rate | $0.72 / MTok |
| Observed cache-hit rate | **100%** — no caching lever left |
| Cache-only savings available | $0.00 |

One heavy Claude Code user burns **~$8–9k/month at API list rates**. A 5 × $20 pool
covers ~1% of that. The subscription is the subsidized product; the API is the
expensive one. This is the same conclusion register 187 taught from the outside:
someone measures the thesis and gets a negative — you record it, you don't argue.

Two levers the pitch leaned on, adjudicated:

- **Batch tier** — does not apply to live interactive sessions; it changes *when*
  work runs. `CONTRACTUAL_ONLY`, off by default (unchanged from slice 1).
- **Cache headroom** — already 100% on real Claude Code traffic. Zero.

**Surviving hypothesis (UNRESOLVED, testable):** members whose *measured* usage
prices below their seat. A light user (a few sessions a week) may cost $2–10/month
at list rates; for them a metered seat genuinely beats $20 flat. The qualifying
instrument already exists: **run the slice-1 audit on the candidate's machine
before admitting them.** Admission rule: trailing-30-day API-equivalent cost
< 50% of seat price, re-checked monthly. No audit, no seat.

So the honest product is not "more for less." It is **metered honesty with hard
caps** — pay for what you burn, capped, attributed, reconciled.

## 1. What the terms permit (primary docs, read 2026-08-30)

- **Consumer subscriptions:** pooling one login across people is account sharing —
  banned. That is why this design never touches claude.ai accounts.
- **Commercial Terms:** "Customer may not and must not attempt to … resell the
  Services except as expressly approved by Anthropic." → **Charging margin is
  prohibited resale. This pool must run at cost, or not at all.**
- At-cost splitting among named members of one org is not expressly addressed.
  Defensible under §D.5 ("Customer is responsible for all activity under its
  account") and §A.1 (powering products for one's own end users), but it is *not*
  "expressly approved" — grade it the way the register grades a provider's-word
  claim: **CONTRACTUAL_ONLY / gray.** For 3–5 friends at cost: proceed. As a
  product for strangers: get written approval first or don't build.
- **Liability (§D.5, §K.2):** the org owner is liable for **all** spend and all
  member conduct. Every dollar of every member's usage bills to Angus's card.
  A member's unpaid share is Angus's loss, full stop. The design below treats
  this as a first-class constraint, not a footnote.
- **Admin API** requires an organization (unavailable on individual accounts) and
  an Admin API key (`sk-ant-admin…`, admin role only).

## 2. Architecture — built around the slice-1 reuse boundary

Slice 2 imports three units from slice 1 **unchanged** (spec §7.1, architecture.md §3):
`UsageEvent` (types.ts), `RateCard` (rates.ts), `costOfEvent()` (pricing.ts).
If this design ever needs to edit inside that boundary, that is a design-review
signal, not a patch.

New units — the four names architecture.md already reserves, plus one importer:

```
src/
├── importers/
│   └── adminUsage.ts   /v1/organizations/usage_report/messages rows → UsageEvent[]
│                        (the CLI's --admin flag already parses this shape; this
│                         makes it a poller source, not a file)                [pure]
├── ledger.ts           append-only priced rows, keyed (api_key_id, bucket);
│                        raw API responses stored beside priced rows           [pure core, I/O shell]
├── budget.ts           per-member balance, soft thresholds, hard cap          [pure]
├── reserve.ts          in-flight exposure bound: freshness lag × burn rate    [pure]
└── reconcile.ts        ledger totals vs cost_report, tolerance, verdict       [pure]
```

Pricing stays integer micro-cents through `costOfEvent()`. No floats in money,
same as slice 1.

## 3. Provisioning — individual credentials, never shared

```
Console org (Angus, admin — holds the only Admin key)
├── workspace member-a  →  1 API key  →  member A's machines only
├── workspace member-b  →  1 API key  →  member B's machines only
└── … (3–5 total)
```

- One workspace per member, one key per workspace. The workspace is the
  attribution unit and the blast radius.
- Members are **not** Console org members — they hold a key, nothing else.
  Fewer roles, and it matches the liability reality: Angus owns everything.
- Each member runs Claude Code against their own key (`ANTHROPIC_API_KEY`).
  Claude Code supports API-key auth natively; no shared login exists anywhere
  in the system.
- Key rotation: on any suspicion, Admin API sets the key `inactive` and a new
  key is issued in the same workspace. Attribution history survives (it is
  keyed by `api_key_id`, and the ledger records the key→member mapping as
  slowly-changing data).

## 4. Attribution — immutable, from the provider's own meter

- Poller hits `GET /v1/organizations/usage_report/messages` with
  `group_by[]=api_key_id`, `bucket_width=1m`, polling once per minute (the
  documented sustained rate). Data freshness is ~5 minutes.
- Every response is stored raw (append-only) before pricing; priced rows go to
  the ledger via `costOfEvent()`. Nothing is ever updated in place — corrections
  are compensating entries.
- Cross-check: the **Claude Code Analytics API** provides per-user estimated
  costs for Claude Code specifically — a second instrument for the same number.

## 5. Budgets, alerts, revocation

Prepay only. A member's balance is credit already paid in; the system never
extends debt (see §7 for why).

| Threshold | Action |
|---|---|
| 50% / 80% / 95% of balance | alert to member (and Angus at 95%) |
| 100% | Admin API `POST /v1/organizations/api_keys/{key_id}` `{"status": "inactive"}` — verified endpoint, verified status value |

- **Worst-case exposure window:** ~5 min data freshness + 1 min poll + one
  in-flight request ≈ **6–7 minutes of unmetered burn** before the key dies.
  `reserve.ts` prices this: exposure = window × member's peak observed burn
  rate, and that exposure is *held back* from the spendable balance. A member
  with $20 credit and a $2/min observed peak can spend $20 − (7 × $2) = $6
  before the soft-stop, not $20. This is the honest cost of a 5-minute meter.
- Belt-and-braces: Console workspace spend limits, set by hand in the Console
  UI at member setup. (The spend-limits *API* is Enterprise-only per the Admin
  API docs; for Console orgs treat the UI limit as unverified-until-set and
  confirm it exists during provisioning.)
- Reactivation is manual, after payment clears. No auto-reactivation path —
  a bug there spends Angus's money.

## 6. Reconciliation — a different instrument grades the ledger

Nightly job:

1. Sum the ledger per workspace for the day (our pricing: `costOfEvent()`).
2. Fetch `GET /v1/organizations/cost_report` with `group_by[]=workspace_id`
   (Anthropic's pricing, USD cents, daily buckets — the only granularity it has).
3. Compare. Tolerance: 1¢ + 0.1% per workspace-day.
4. Outside tolerance → alarm, freeze admissions and top-ups until explained.
   Inside → write a dated reconciliation row (append-only, like everything).

The instrument that produced the number never grades it: the ledger prices with
our rate card, the cost report prices with theirs. Divergence is signal — a rate
card gone stale (slice 1 already carries `cardAgeDays()`), a new cost type
(code execution appears only in cost_report), or a bug.

## 7. Failed payments and member lifecycle

- **Prepay makes "failed payment" a non-event:** there is no invoice to fail.
  Balance reaches zero → key goes inactive → work stops → no debt exists.
- Top-up flow (out of scope to build now): money in → compensating credit row →
  key reactivated manually.
- **Leaving:** key inactive → final reconciliation → refund remaining balance →
  workspace archived. Ledger retained (it is the audit trail).
- **The administrator's line, stated plainly:** every failure mode in §5 and §6 —
  the exposure window, a poller outage, a reconciliation bug — lands on Angus's
  card. Anthropic will bill the org for all usage regardless of what this
  system records. The pool's total cap should therefore be money Angus can
  afford to lose outright, and a poller health-check (dead-man alert if no
  successful poll in 10 min) is part of the minimum viable build, not polish.

## 8. Open issues (named, not hidden)

1. **Rate-limit contention:** org-level rate limits are shared. One member's
   agent swarm can starve another's session. Mitigation unknown; measure first.
2. **Console workspace spend limits** for non-Enterprise orgs: existence assumed
   from Console UI, not verified from docs. Verify during provisioning; if
   absent, §5's poller is the only hard cap and the reserve margin must widen.
3. **Light-user cohort is unmeasured.** The surviving hypothesis has zero data
   points. Before building anything, run the slice-1 audit on the 2–4 real
   candidates. If nobody qualifies, there is no product and this spec is a
   well-documented "no."

## 9. Proposed register rows

- **NEXT-ID FAIL** — "Pooled API org beats subscriptions for a heavy Claude Code
  user": measured NEGATIVE on this machine — $8,100.09 API-equivalent in ~26
  days vs a flat-rate subscription; cache-hit already 100%, batch inapplicable
  to interactive traffic. The subsidy runs the other way.
- **NEXT-ID+1 UNRESOLVED** — "A light user prices below $20/month at list rates":
  plausible, untested; the slice-1 audit on each candidate's machine is the test.

## 10. Explicitly out of scope

No payment processing, no invites, no account creation, no credits purchased,
no deployment, no publication, no commits, no margin, no strangers.
