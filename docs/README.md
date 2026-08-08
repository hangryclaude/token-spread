# docs/

| Path | What it is |
|---|---|
| [`specs/2026-08-08-savings-report-design.md`](specs/2026-08-08-savings-report-design.md) | The design spec — the authoritative description of slice 1 (ledger-shaped). Start here. |
| [`specs/2026-08-08-savings-report-design.html`](specs/2026-08-08-savings-report-design.html) | A rendered, readable copy of the same spec. |
| [`plans/2026-08-08-savings-report-slice-1.md`](plans/2026-08-08-savings-report-slice-1.md) | The as-built implementation plan (task-by-task). |
| [`plans/CONTRACT.md`](plans/CONTRACT.md) | ⚠️ **Stale.** An early locked interface contract; the code diverged from it (and improved on it). Reconcile or delete before slice 2 — the code is the source of truth. |
| [`architecture.md`](architecture.md) | Module boundaries and the slice-2 contract notes. |
| [`margin-model.html`](margin-model.html) | The worked margin example. ⚠️ Some figures here are stale — the README's **What you net** table is computed from the code and is authoritative. |

## Two known doc-debt items

Both are cosmetic and flagged rather than silently fixed:

1. **`plans/CONTRACT.md`** describes an interface the built code doesn't follow.
2. **`margin-model.html`** carries a couple of pre-final numbers (e.g. `$282.95` where the
   verified value is `$283.75`).

Clean both up alongside the slice-2 work, or on request.
