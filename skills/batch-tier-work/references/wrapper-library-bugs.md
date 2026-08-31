# Batch/replay wrapper library bugs

Six open-source Batch API wrapper libraries were checked in source (not just README) for
whether they actually implement correct partial-resubmission and idempotent-replay
behavior. Three do damage; two are cosmetic; one (the register's own PASS_REPLAY
precedent) does it right. All six were re-fetched at a pinned commit and every quoted
line was verified against that commit, not against the library's own claims about itself.

The Anthropic Batches API's `processing_status` field is a closed 3-value enum:
`in_progress`, `canceling`, `ended` (confirmed against
`platform.claude.com/docs/en/api/messages/batches/retrieve`). Per-item outcome
(`succeeded`/`errored`/`canceled`/`expired`) lives one level down, on each result row, not
on the batch object. Four of these six bugs are the same root confusion: code written as
if `processing_status` could be `failed`/`cancelled`/`expired`, checking a value the API
can never actually return.

## id 303 — instructor (567-labs), 13.7k stars — dead failure-detection branch

`instructor/batch/providers/anthropic.py:107-108`, commit `812c3a7b`:

```python
if batch.processing_status in ["failed", "cancelled", "expired"]:
    raise Exception(f"Batch job failed with status: {batch.processing_status}")
```

None of those three strings is a legal value of `processing_status` — the branch is
structurally dead code. `retrieve_results()` and `download_results()` both funnel through
`_iter_result_lines()`, which only raises when `request_counts` shows `errored>0` **and**
`succeeded==0` (100% error rate). Any batch ending with a mix of succeeded/errored/expired
items — the normal case — falls through with zero per-item `result.type` filtering and
hands the caller error-type lines interleaved with successes, indistinguishable from valid
completions unless the caller re-implements the check this code claims to already perform.

Not a token-cost bug — a data-integrity bug. Nothing about the request or the model's
output changes; what changes is whether the caller notices its answers are half garbage.
Exposure is broad: the dead branch sits directly in the path both public retrieval
functions call.

## id 304 — langbatch (EasyLLM) — `retry()` re-bills the full batch

`langbatch/anthropic.py:110-114`, commit `b1d2b35b`:

```python
def retry(self):
    if self.platform_batch_id is None:
        raise BatchStateError("Batch not started")
    self._create_batch()
```

`_create_batch()` → `_prepare_data()` → `_get_requests()` (parent `Batch` class,
`Batch.py:251-264`) re-reads the original `self._file` set once at `__init__` — every
line, unfiltered, with no reference to `custom_id`, prior success, or the earlier
`platform_batch_id`'s results. `.retry()` genuinely resubmits 100% of the original batch
as a brand-new batch, including rows that already succeeded — the model re-answers
prompts it already finished, at full cost, on every retry call.

Secondary defect, same file: `anthropic_state_map` (lines 13-20) maps
`'succeeded'/'errored'/'canceled'/'expired'` onto `response.processing_status` — values
the field can never hold per the closed enum above — and is additionally missing a
`'canceling'` key, so `get_status()` raises `KeyError` on any batch mid-cancellation.
`is_retryable_failure()` (lines 103-108) gates on `get_status()` returning `'errored'` or
`'expired'`, which it can never produce — so the gated, "safe" retry path documented as
first-class is unreachable. A caller who calls `.retry()` directly, which the public API
permits, gets the full re-bill with no gate stopping them.

This is the one library in this set where the bug is a genuine FAIL under the strict bar:
"a different amount of thinking happens" — duplicate generation on already-answered rows.

## id 305 — batchata (agamm) — cosmetic mislabel only

`batchata/providers/anthropic/anthropic.py:171-172`, commit `c15f2247`:

```python
elif status in ["canceled", "expired"]:
    return "failed", {"batch_id": batch_id, "reason": f"Batch {status}"}
```

Same vocabulary confusion — this branch can't fire either, and a genuinely-canceling batch
falls through to a separate `else: return "pending", None` mislabel. But
`batchata/core/batch_run.py:543-639` was independently checked and even when
`get_batch_status()` returns `"failed"`, `_execute_batch()` explicitly falls through
(comment at line 609: `# Continue to get individual results - some jobs might have
succeeded`) and unconditionally calls `get_batch_results()`. Per-row success/failure is
then correctly re-derived downstream via `r.is_success` on each parsed result, independent
of whatever label `get_batch_status()` produced. The dead branch has no path to actually
losing or mislabeling a result — the only observable effect is a wrong status string in a
log line. Registered as `FAIL` for consistency (not a technique, delivers no benefit), but
explicitly near-zero severity, unlike id 304.

## id 306 — BatchLLM (he-yufeng) — checkpoint hash misses template fields

`processor.py:307-320`, commit `1d787b3c`, builds a SHA-256 fingerprint over
`items`/`model`/`system_prompt`/`prompt_template`/`max_tokens`/`temperature`/`base_url`/
`max_retries`/`timeout`, and `_load_checkpoint` (line 343) additionally checks each row's
raw input text byte-for-byte before reuse. This is a stronger design than most of the
field — on first read it looked like a second PASS_REPLAY instance alongside id 258.

It doesn't survive a second pass. BatchLLM's own headlined "Multi-field templates" feature
(README:43, 171-181 — e.g. `-t "Translate this to {language}, then summarize: {text}"`)
substitutes other CSV/JSONL columns into the rendered prompt via `_render_template`
(`processor.py:56-68`). Those substituted `fields` are absent from the fingerprint hash,
never persisted to the checkpoint file at all (`_save_checkpoint`, `processor.py:399-421`
writes only index/input/output/error/tokens/latency), and not covered by the per-row
input check (which compares only the raw `input` column, never the rendered prompt).
Concrete failure: checkpoint a multi-field run, interrupt it, edit only the `language`
column on an already-completed row, resume — fingerprint matches, input matches, and the
stale translation replays verbatim. The row the model would actually read on a fresh call
is never sent.

Same structural class as id 259 (curator): a hash over a declared subset of the generative
inputs — a "recipe" — rather than the full rendered request, with an untracked remainder
free to drift the real outbound content while the guard reports a clean match. This is why
PASS_REPLAY requires hashing **the full request**, not a proxy for it, however
comprehensive the proxy looks on first read.

## id 258 — the one that's right (bespokelabs/curator, batch resubmission)

Not a bug entry — the contrast case. Partial-batch resubmission is verified by the
resubmitted request file's line count equaling `total_requests − already_answered_count`,
never the original total. It works because it operates on the actual on-disk request file
byte-for-byte, not a hash of the parameters that produced it. Use this shape, not a
fingerprint-of-config shape, if you're building your own resubmission or checkpoint layer.
