import type { Report } from "../report";
import { PLEX_MONO_400, PLEX_MONO_600, PLEX_SANS_VAR } from "./fonts";

/**
 * The audit as a document.
 *
 * Terminal output is a result; this is the deliverable — something a buyer forwards to
 * whoever signs. That imposes three constraints the CLI never had:
 *
 *   - **Standalone.** No script src, no remote stylesheet, no webfont. It has to open
 *     offline, from an email attachment, on a machine that has never heard of us.
 *   - **Escaped.** Model names and workspace ids arrive from the customer's own report.
 *     Rendering them raw hands a prospect an XSS bug in the document we sent them.
 *   - **Evidence beside every figure.** A number on its own is a claim. Finance is right
 *     not to believe it, so each one is shown next to the events and the dated rate card
 *     it came from, and anything unmeasurable says so rather than being omitted.
 *
 * Pure: takes a Report, returns a string. No clock, no filesystem, no network.
 */
export function renderAuditHtml(r: Report): string {
  const pctSaved = r.savingsPct.combined;
  // From the report itself, never inferred. The old line guessed from byProject's presence —
  // which every non-empty report has — so a local-transcript audit stamped its provenance
  // footer "admin_usage_report". The one test covering this line only ever built admin-origin
  // fixtures, so it passed identically whether the label was derived or hardcoded.
  const sources = r.dataSources;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<!-- inline, like everything else here: the document must not request anything -->
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='9' fill='%233DDC84'/%3E%3C/svg%3E">
<title>Token audit — ${esc(r.generatedAt.slice(0, 10))}</title>
<style>
  /* IBM Plex, SIL OFL 1.1, carried as data URIs. A document that fetched its own type
     would break the promise the rest of this tool makes, and would render wrong on the
     air-gapped laptop it is most likely to be opened on. */
  @font-face{font-family:'IBM Plex Sans';font-weight:400 700;font-style:normal;font-display:swap;
    src:url(data:font/woff2;base64,${PLEX_SANS_VAR}) format('woff2-variations'),
        url(data:font/woff2;base64,${PLEX_SANS_VAR}) format('woff2')}
  @font-face{font-family:'IBM Plex Mono';font-weight:400;font-style:normal;font-display:swap;
    src:url(data:font/woff2;base64,${PLEX_MONO_400}) format('woff2')}
  @font-face{font-family:'IBM Plex Mono';font-weight:600;font-style:normal;font-display:swap;
    src:url(data:font/woff2;base64,${PLEX_MONO_600}) format('woff2')}
  *,*::before,*::after{box-sizing:border-box}
  :root{
    --bg:#fff; --bg2:#f6f8f7; --line:#e3e9e6; --ink:#0d1411; --ink2:#4a5a53; --ink3:#5f6e67;
    --acc:#0a7d45; --acc-soft:#e8f6ee; --warn:#8a6410; --warn-soft:#fbf4e3; --bad:#a5352a;
    --mono:'IBM Plex Mono',ui-monospace,SFMono-Regular,Menlo,monospace;
  }
  @media (prefers-color-scheme:dark){:root{
    --bg:#0d1114; --bg2:#151b1e; --line:#26302f; --ink:#e8eeeb; --ink2:#b3c1bb; --ink3:#84968d;
    --acc:#4ec98a; --acc-soft:#12291f; --warn:#d6a544; --warn-soft:#2c2314; --bad:#e57866;
  }}
  body{margin:0;background:var(--bg);color:var(--ink);
    font:400 16px/1.62 'IBM Plex Sans',-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
    -webkit-font-smoothing:antialiased}
  .wrap{max-width:52rem;margin:0 auto;padding:3.5rem 1.5rem 5rem}
  header{border-bottom:1px solid var(--line);padding-bottom:2rem;margin-bottom:2.5rem}
  .eyebrow{font-family:var(--mono);font-size:.72rem;letter-spacing:.14em;text-transform:uppercase;
    color:var(--acc);margin:0 0 .8rem}
  h1{font-size:clamp(1.9rem,5vw,2.7rem);line-height:1.1;letter-spacing:-.025em;margin:0 0 .7rem}
  .sub{color:var(--ink2);margin:0}
  h2{font-size:.78rem;font-family:var(--mono);letter-spacing:.13em;text-transform:uppercase;
    color:var(--ink3);font-weight:600;margin:2.8rem 0 1rem;padding-bottom:.6rem;
    border-bottom:1px solid var(--line)}
  p{margin:0 0 1rem}
  .figs{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(9rem,100%),1fr));gap:1px;
    background:var(--line);border:1px solid var(--line);border-radius:.6rem;overflow:hidden}
  .fig{background:var(--bg);padding:1.1rem 1.2rem}
  .fig .k{display:block;font-size:.72rem;letter-spacing:.08em;text-transform:uppercase;color:var(--ink3)}
  .fig .v{display:block;font-size:1.5rem;font-weight:650;letter-spacing:-.02em;margin-top:.3rem;
    font-variant-numeric:tabular-nums}
  .fig .n{display:block;font-size:.8rem;color:var(--ink3);margin-top:.2rem}
  .acc{color:var(--acc)}
  table{border-collapse:collapse;width:100%;font-size:.92rem}
  .scroll{overflow-x:auto;border:1px solid var(--line);border-radius:.6rem;margin-bottom:1.2rem}
  th,td{text-align:left;padding:.7rem .9rem;border-bottom:1px solid var(--line);vertical-align:top}
  thead th{font-family:var(--mono);font-size:.7rem;letter-spacing:.1em;text-transform:uppercase;
    color:var(--ink3);background:var(--bg2);white-space:nowrap}
  tbody tr:last-child td{border-bottom:none}
  td.n,th.n{text-align:right;font-family:var(--mono);font-variant-numeric:tabular-nums;white-space:nowrap}
  .lever{border:1px solid var(--line);border-left:3px solid var(--acc);border-radius:.5rem;
    padding:1.1rem 1.2rem;margin-bottom:.9rem;background:var(--bg2)}
  .lever h3{margin:0 0 .3rem;font-size:1.02rem}
  .lever .amt{font-family:var(--mono);font-weight:650;color:var(--acc);font-variant-numeric:tabular-nums}
  .lever p{margin:.5rem 0 0;font-size:.9rem;color:var(--ink2)}
  .tag{display:inline-block;font-family:var(--mono);font-size:.66rem;font-weight:600;
    letter-spacing:.06em;padding:.15rem .45rem;border-radius:.25rem;background:var(--acc-soft);
    color:var(--acc);vertical-align:.1em;margin-left:.4rem}
  .warn{border:1px solid var(--line);border-left:3px solid var(--warn);background:var(--warn-soft);
    border-radius:.5rem;padding:.9rem 1.1rem;margin-bottom:.7rem;font-size:.9rem;color:var(--ink2)}
  .note{font-size:.86rem;color:var(--ink3)}
  code{font-family:var(--mono);font-size:.88em}
  footer{margin-top:3.5rem;padding-top:1.5rem;border-top:1px solid var(--line);
    font-size:.84rem;color:var(--ink3)}
</style>
</head>
<body>
<div class="wrap">

<header>
  <p class="eyebrow">Token audit</p>
  <h1>${esc(money(r.currentCost))} of measured spend.</h1>
  <p class="sub">Generated ${esc(r.generatedAt.slice(0, 10))} from ${num(r.provenance.imported)} priced
    ${r.provenance.imported === 1 ? "event" : "events"}, priced against the rate card captured
    ${esc(r.rateCard.capturedAt)}. Every figure below is computed from those events; none is estimated.</p>
</header>

<div class="figs">
  <div class="fig"><span class="k">Current cost</span><span class="v">${esc(money(r.currentCost))}</span>
    <span class="n">${num(r.provenance.imported)} events</span></div>
  <div class="fig"><span class="k">Cache-hit rate</span><span class="v">${Math.round(r.cacheHitRate * 100)}%</span>
    <span class="n">reads ÷ (reads + fresh)</span></div>
  <!-- allMeasured, not combined: this tile is the first figure a buyer reads, and fed with
       cache headroom alone it printed "$0.00" directly above a priced finding worth $374.93. -->
  <div class="fig"><span class="k">Recoverable</span><span class="v acc">${esc(money(r.savings.allMeasured))}</span>
    <span class="n">${(r.savings.allMeasured.cents / Math.max(1, r.currentCost.cents) * 100).toFixed(1)}% of the bill</span></div>
  <div class="fig"><span class="k">Blended rate</span><span class="v">${esc(money(r.effectiveRatePerMTok.before))}</span>
    <span class="n">per MTok today</span></div>
</div>

<h2>Where the money is</h2>
${r.findings.length === 0 && r.savings.combined.cents === 0
  ? `<p>No identity-preserving saving was found on this traffic. That is a real result, not an
     empty one: the levers this audit checks are already in effect, or the headroom they need is
     not there. A tool that always finds a saving is not measuring anything.</p>`
  : ""}
${r.savings.cacheOnly.cents > 0 ? `<div class="lever">
  <h3>Cache-hit headroom <span class="tag">PASS_METADATA</span></h3>
  <p><span class="amt">${esc(money(r.savings.cacheOnly))}</span> — raising the hit rate to
    ${r.cacheHeadroom?.targetCacheHitPct ?? 0}%. Caching moves input tokens from the full rate to the
    0.1× read rate. Same model, same prompt, same output.</p>
</div>` : ""}
${r.findings.map((f) => `<div class="lever">
  <h3>${esc(f.lever)} <span class="tag">${esc(f.evidence)}</span></h3>
  <p><span class="amt">${esc(money(f.saved))}</span> — ${esc(f.detail)}</p>
</div>`).join("\n")}

${r.ttlRightSizing.exposedTokens > 0 && !r.ttlRightSizing.computable ? `<div class="warn">
  <strong>${num(r.ttlRightSizing.exposedTokens)} tokens were written at the 1-hour cache TTL</strong>,
  which bills at 2× base input against 1.25× for five minutes. Whether five minutes would have
  served cannot be answered from an aggregate usage report — that needs the gap between consecutive
  turns in a session. This is <em>exposure</em>, not a saving, and it is stated rather than dropped.
</div>` : ""}

<h2>By workspace</h2>
<div class="scroll"><table>
  <thead><tr><th>Workspace</th><th class="n">Cost</th></tr></thead>
  <tbody>${Object.entries(r.byProject).sort((a, b) => b[1].cents - a[1].cents)
    .map(([k, v]) => `<tr><td>${esc(k)}</td><td class="n">${esc(money(v))}</td></tr>`).join("")}</tbody>
</table></div>

<h2>By model</h2>
<div class="scroll"><table>
  <thead><tr><th>Model</th><th class="n">Cost</th></tr></thead>
  <tbody>${Object.entries(r.byModel).sort((a, b) => b[1].cents - a[1].cents)
    .map(([k, v]) => `<tr><td><code>${esc(k)}</code></td><td class="n">${esc(money(v))}</td></tr>`).join("")}</tbody>
</table></div>

<h2>Tokens</h2>
<div class="scroll"><table>
  <thead><tr><th>Category</th><th class="n">Tokens</th><th>Billed at</th></tr></thead>
  <tbody>
    <tr><td>Cache reads</td><td class="n">${num(r.tokens.cacheRead)}</td><td>0.1× base input</td></tr>
    <tr><td>Fresh input</td><td class="n">${num(r.tokens.input)}</td><td>1× base input</td></tr>
    <tr><td>Cache writes</td><td class="n">${num(r.tokens.cacheCreation)}</td><td>1.25× at 5m, 2× at 1h</td></tr>
    <tr><td>Output</td><td class="n">${num(r.tokens.output)}</td><td>output rate</td></tr>
  </tbody>
</table></div>

${r.warnings.length ? `<h2>What you should know</h2>
${r.warnings.map((w) => `<div class="warn">${esc(w)}</div>`).join("\n")}` : ""}

<h2>How this was measured</h2>
<div class="scroll"><table>
  <thead><tr><th>Input</th><th class="n">Count</th></tr></thead>
  <tbody>
    <tr><td>Records read</td><td class="n">${num(r.provenance.linesSeen)}</td></tr>
    <tr><td>Priced</td><td class="n">${num(r.provenance.imported)}</td></tr>
    <tr><td>Malformed, excluded</td><td class="n">${num(r.provenance.malformed)}</td></tr>
    <tr><td>Duplicates dropped</td><td class="n">${num(r.provenance.deduped)}</td></tr>
    <tr><td>Unknown model, excluded</td><td class="n">${num(r.provenance.skipped.unknown_model)}</td></tr>
    <tr><td>Unpriceable service tier, excluded</td><td class="n">${num(r.provenance.skipped.unknown_tier)}</td></tr>
  </tbody>
</table></div>
<p class="note">Source: ${sources.length ? sources.map((s) => `<code>${esc(s)}</code>`).join(", ") : "<em>no priced events</em>"}. Rate card captured
  ${esc(r.rateCard.capturedAt)}. ${esc(r.rateCard.notes.join(" "))}</p>

<footer>
  <p>Token counts and dimensions only. No prompt or completion text was read to produce this
  document, and none appears in it. Levers compound by product, never by sum — a total that is the
  arithmetic sum of its parts is overstated.</p>
</footer>

</div>
</body>
</html>
`;
}

const ENTITIES: Record<string, string> = {
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
};

/** Customer-supplied strings reach this document; none of them may become markup. */
function esc(v: unknown): string {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ENTITIES[c]);
}

const num = (n: number): string => n.toLocaleString("en-US");
const money = (m: { formatted: string }): string => m.formatted;
