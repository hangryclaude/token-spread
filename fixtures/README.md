# fixtures/

**Synthetic only — no real transcripts ever live here.** Each fixture is a tiny,
hand-authored `.jsonl` that exercises one behaviour, with its expected result computed by
hand (not by the code under test) so assertions are checked against a different instrument.

| Fixture | Lines | What it exercises |
|---|---:|---|
| `mixed.jsonl` | 3 | Two models (Opus + Haiku) across projects — the main cost, per-model breakdown, routing and compounding fixture. |
| `malformed.jsonl` | 4 | Bad rows (negative / missing token fields) → `malformed` bucket, plus an unknown model (`some-other-model`) → `skipped`, alongside a valid control row. Nothing is silently miscounted. |
| `dupes.jsonl` | 2 | A repeated `requestId` → `deduped`; the bill is never double-counted. |
| `nokey.jsonl` | 2 | Records with no `requestId` → the importer synthesizes a key and counts it in `synthesizedKeys` (collisions are bounded and reported, not hidden). |
| `e2e-detectors.jsonl` | 10 | One session that over-buys a 1h cache write and then flips to 5m-only writes, plus 8 days of spend with a 10x spike — drives TTL right-sizing, TTL crossing and spend-anomaly output through the real CLI process boundary in one run. |

Records mirror the real Claude Code transcript shape (`type`, `timestamp`, `requestId`,
`message.model`, `message.usage.*`) — but the importer reads only the token-count fields;
any `content` present is ignored, and a test asserts it never reaches an event.
