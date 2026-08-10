#!/usr/bin/env python3
"""Score a vision transcription of a rendered text page against ground truth.

Usage:  python3 score.py <tag>            e.g. 12px, n12px, prose-native-12px
        python3 score.py <tag> --pass b   score a second, independent grading pass

Reports exact recall with a Wilson 95% interval, the per-character error rate, and
the confusion pairs — because *how* a probe is wrong decides whether the technique
is merely lossy or actively dangerous.
"""
import re, sys, math, pathlib

HERE = pathlib.Path(__file__).parent
OUT = HERE / "out"

PROBE = re.compile(r"PROBE-(\d{4})=([0-9a-f]{6})")


def wilson(hits: int, n: int, z: float = 1.96) -> tuple[float, float]:
    """Wilson score interval. Normal approximation is wrong at these n and these rates."""
    if n == 0:
        return (0.0, 0.0)
    p = hits / n
    d = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / d
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (max(0.0, centre - half), min(1.0, centre + half))


def load(path: pathlib.Path) -> dict[str, str]:
    # Newlines are stripped first: the page is hard-wrapped at the column width, so a
    # probe can straddle a line break. It is still one probe on the page and a grader
    # reads it as one — leaving the newline in would score a correct read as a ghost.
    return dict(PROBE.findall(path.read_text().replace("\n", "")))


def main() -> int:
    tag = sys.argv[1]
    grading_pass = "a"
    if "--pass" in sys.argv:
        grading_pass = sys.argv[sys.argv.index("--pass") + 1]

    truth_path = OUT / f"truth-{tag}.txt"
    if not truth_path.exists():
        raise SystemExit(
            f"no {truth_path.name} — tags are the render's TAG plus the font size, e.g. "
            f"codeB-12px. Available: "
            + ", ".join(sorted(p.name[6:-4] for p in OUT.glob("truth-*.txt"))))
    truth = load(truth_path)

    suffix = "" if grading_pass == "a" else f"-{grading_pass}"
    read = load(HERE / f"read-{tag}{suffix}.txt")

    hit, miss, ghost = [], [], []
    for pid, code in read.items():
        if pid not in truth:
            ghost.append((pid, code))
        elif truth[pid] == code:
            hit.append(pid)
        else:
            miss.append((pid, truth[pid], code))

    n = len(read)
    lo, hi = wilson(len(hit), n)

    # Per-character rate over the probes actually attempted: the fraction of glyphs
    # misread, which is the number that predicts damage on longer identifiers.
    chars_total = 6 * (len(hit) + len(miss))
    chars_wrong = sum(sum(1 for a, b in zip(t, r) if a != b) for _, t, r in miss)
    clo, chi = wilson(chars_total - chars_wrong, chars_total)

    print(f"page {tag} · grading pass {grading_pass.upper()}")
    print(f"  probes on page       {len(truth)}")
    print(f"  transcribed          {n}")
    print(f"  exact                {len(hit):>3}/{n}  {100*len(hit)/n:5.1f}%   95% CI [{100*lo:.1f}, {100*hi:.1f}]")
    print(f"  wrong code           {len(miss):>3}")
    print(f"  ghost id             {len(ghost):>3}")
    print(f"  chars correct        {chars_total-chars_wrong:>3}/{chars_total}  "
          f"{100*(chars_total-chars_wrong)/chars_total:5.1f}%   95% CI [{100*clo:.1f}, {100*chi:.1f}]")
    print(f"  per-char error rate  {100*chars_wrong/chars_total:5.2f}%")

    # Split the misses into the two failure modes, which need different fixes.
    # A "drift" is a code that WAS read correctly — it just landed under the wrong key.
    # No character-level check catches it, and a bigger font will not fix it.
    truth_codes = set(truth.values())
    drift = [(pid, t, r) for pid, t, r in miss if r in truth_codes]
    glyph = [(pid, t, r) for pid, t, r in miss if r not in truth_codes]
    if miss:
        print(f"  ├ association drift {len(drift):>3}  (code read correctly, filed under the wrong key)")
        print(f"  └ glyph error       {len(glyph):>3}  (code not present on the page at all)")
        # Position-independent recall: was the right string seen anywhere on the page?
        seen_anywhere = len(hit) + len(drift)
        slo, shi = wilson(seen_anywhere, n)
        print(f"  read-anywhere        {seen_anywhere:>3}/{n}  {100*seen_anywhere/n:5.1f}%   "
              f"95% CI [{100*slo:.1f}, {100*shi:.1f}]   <- ceiling if keying were free")

    if miss:
        single = sum(1 for _, t, r in miss if sum(1 for a, b in zip(t, r) if a != b) == 1)
        print(f"  single-char misreads {single:>3}/{len(miss)}  "
              f"({100*single/len(miss):.0f}% of errors are one glyph — these survive review)")
        print("\n  id     truth   read     wrong")
        for pid, t, r in sorted(miss):
            w = sum(1 for a, b in zip(t, r) if a != b)
            print(f"  {pid}  {t}  {r}   {w}/6")
        pairs: dict[tuple[str, str], int] = {}
        for _, t, r in miss:
            for a, b in zip(t, r):
                if a != b:
                    pairs[(a, b)] = pairs.get((a, b), 0) + 1
        top = sorted(pairs.items(), key=lambda kv: -kv[1])[:8]
        print("\n  confusions (truth->read):", ", ".join(f"{a}->{b} x{c}" for (a, b), c in top))
    if ghost:
        print("\n  ghosts:", ", ".join(f"{p}={c}" for p, c in sorted(ghost)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
