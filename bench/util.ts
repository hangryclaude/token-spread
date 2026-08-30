/**
 * Shared bench/ helpers. Three scripts (counterfactual.ts, demo.ts, snapshot.ts) each
 * hand-rolled their own copy of `arg`, and two (counterfactual.ts, demo.ts) each hand-rolled
 * `usd`/`n` on top of that — one place to fix a formatting bug instead of two or three.
 *
 * src/cli.ts has its own, richer flag parser (validation, --help, exit codes) for the
 * product's own CLI surface; this one is deliberately smaller because bench/ only ever
 * needs a single-valued `--flag value`.
 */

/** `--name value` from argv, or `d` if the flag is absent. */
export const arg = (n: string, d?: string): string | undefined => {
  const i = process.argv.indexOf(`--${n}`);
  return i === -1 ? d : process.argv[i + 1];
};

/** Micro-cents to a grouped dollar string, e.g. `$12.34`. */
export const usd = (uc: number): string =>
  "$" + (uc / 1e8).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Grouped thousands, e.g. `12,345`. */
export const n = (x: number): string => x.toLocaleString("en-US");
