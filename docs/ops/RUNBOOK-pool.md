# Pool go-live runbook

From code-on-a-branch to a metered pool. Every step is idempotent; nothing here
processes payments (spec §10 — money moves outside, `pool credit` records it).

**The one rule before any step: keys never travel through chat, argv, or a committed
file.** The Admin key lives in `~/.config/token-spread/admin.env` (chmod 600) and is
sourced into the environment. Member keys go straight from the Console to the member.

```
# once
mkdir -p ~/.config/token-spread
printf 'ANTHROPIC_ADMIN_KEY=sk-ant-admin01-...\n' > ~/.config/token-spread/admin.env
chmod 600 ~/.config/token-spread/admin.env
```

## 0 · What only a human can do (three things)

1. **Console org.** The Admin API does not exist for individual accounts —
   Console → Settings → Organization, create it.
2. **Admin API key.** Console → Settings → Organization → Admin keys (admin role
   required). Into `admin.env`, nowhere else.
3. **Member audits.** Spec §0's admission rule: run the slice-1 audit on each
   candidate's machine (`bun run src/cli.ts` there). Trailing-30-day API-equivalent
   under 50% of the seat price → qualified. No audit, no seat. Anyone whose audit
   reads like the operator's ($8,100/26 days) belongs on a subscription, not here.

## 1 · Workspaces + seats

```
set -a; source ~/.config/token-spread/admin.env; set +a
bun run src/pool/provision.ts --members angus,friend-one,friend-two --out pool.json
```

Creates `pool-<member>` workspaces (finds existing ones — safe to re-run). API keys
cannot be created by API: the tool prints `MISSING <member>` for each workspace that
still needs one. In Console → API keys, create **one** key per pool workspace, scoped
to that workspace, and hand the secret to the member — the operator never needs it.
Re-run the same command; when nothing is missing or ambiguous it writes `pool.json`
(workspace ids + `apikey_` ids only — no secrets; safe to commit).

**Also in Console, per workspace: set a spend limit** (spec §5's belt-and-braces).
The poller is the fast cap; the workspace limit is the one that survives the poller
being down.

Member setup is one line on their machine: `export ANTHROPIC_API_KEY=<their key>` —
Claude Code picks it up natively.

## 2 · Fund the seats

```
bun run src/pool/cli.ts credit --config pool.json --data ./pool-data \
  --member friend-one --cents 2000 --note "aug top-up"
```

Prepay only. Record the credit **after** the money has actually arrived (it's a
ledger, not an invoice). Same-day duplicates dedup — a double-run posts nothing.

## 3 · Dry-run until boring

```
bun run src/pool/cli.ts poll --config pool.json --data ./pool-data
bun run src/pool/cli.ts status --config pool.json --data ./pool-data
```

Dry run is the default: alerts and deactivations print as `DRY-RUN would …` and
nothing remote is touched. Run it a few times across a day of real member traffic.
Believe it only when `status` matches what the Console's own usage page says.

## 4 · Enforce, then schedule

```
bun run src/pool/cli.ts poll --config pool.json --data ./pool-data --enforce
```

`--enforce` is the only path that mutates anything remote (key → `inactive` at the
hard cap). Reactivation is deliberately manual: Console → API keys → activate, after
payment clears — there is no auto-reactivate to have a bug in.

Schedule with launchd (templates in this directory — **edit the paths first**; launchd
gets `/usr/bin:/bin:/usr/sbin:/sbin` only, so every path in a plist is absolute):

```
cp docs/ops/com.tokenspread.pool.poll.plist ~/Library/LaunchAgents/
cp docs/ops/com.tokenspread.pool.reconcile.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.tokenspread.pool.poll.plist
launchctl load ~/Library/LaunchAgents/com.tokenspread.pool.reconcile.plist
```

Poll runs every 60s; reconcile nightly at 02:10 (exit 2 = out of tolerance **or**
unmapped ledger rows — either way the books don't fully reconcile; check
`pool-data/logs/reconcile.err.log`). The dead-man check is `pool-data/health.json`:
if its `lastPollAt` goes stale by more than 10 minutes, the poller is down and the
workspace spend limits from step 1 are the only cap — fix it before topping anyone up.

## 5 · The lines that don't move

- **No margin.** Charging above metered cost is resale the Terms prohibit. The
  operator's compensation is $0.00; the spec says so and the site says so.
- **No subscription quota.** Seats are API workspaces. A Max plan's usage is not
  sellable inventory — that idea is closed (ToS + June 2026 repricing), and no
  feature request reopens it.
- **No strangers at this scale.** 3–5 known people, prepaid. A public pool is a
  different product with a lawyer attached.
- **Liability is the operator's** (Commercial Terms §D.5/§K.2): every seat's spend
  bills to the org card first. Cap the pool at money you can afford to lose.
