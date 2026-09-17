import { useEffect, useRef } from "react";

const NUMBER = /[−+-]?\$?\d[\d,]*(?:\.\d+)?[KMB%]?/;
const DURATION_MS = 480;

/** Splits "Fresh wallets are 100% of buying" around its first figure. */
export function splitFigure(text: string): { before: string; figure: string; after: string } | null {
  const m = NUMBER.exec(text);
  if (!m) return null;
  return { before: text.slice(0, m.index), figure: m[0], after: text.slice(m.index + m[0].length) };
}

/** The figure at `progress` (0..1) of its count-in, keeping sign, currency, grouping, decimals
 * and suffix: countFrame("+$576K", 0.5) === "+$288K". */
export function countFrame(figure: string, progress: number): string {
  const m = /^([−+-]?\$?)([\d,]+(?:\.\d+)?)(.*)$/.exec(figure);
  if (!m) return figure;
  const [, prefix, digits, suffix] = m as unknown as [string, string, string, string];
  const target = Number(digits.replace(/,/g, ""));
  const decimals = digits.includes(".") ? digits.split(".")[1]!.length : 0;
  const value = target * Math.min(1, Math.max(0, progress));
  const body = value.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: digits.includes(",") });
  return `${prefix}${body}${suffix}`;
}

/**
 * A sentence whose first figure counts in once when it mounts. The DOM text is always the
 * final sentence (screen readers and copy get the real value); the counting value is drawn by a
 * CSS pseudo-element over the figure while it runs. Reduced motion: no count, the value is
 * simply there.
 */
export function CountInText({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const parts = splitFigure(text);

  useEffect(() => {
    const el = ref.current;
    if (!el || !parts) return;
    const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || typeof requestAnimationFrame !== "function") return;
    let frame = 0;
    const start = performance.now();
    el.dataset.counting = "";
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION_MS);
      const eased = 1 - Math.pow(1 - t, 3);
      el.dataset.count = countFrame(parts.figure, eased);
      if (t < 1) frame = requestAnimationFrame(tick);
      else {
        delete el.dataset.counting;
        delete el.dataset.count;
      }
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      delete el.dataset.counting;
      delete el.dataset.count;
    };
    // Once per figure: a re-render with the same text doesn't replay it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parts?.figure]);

  if (!parts) return <>{text}</>;
  return (
    <>
      {parts.before}
      <span className="tw-count" ref={ref}>
        {parts.figure}
      </span>
      {parts.after}
    </>
  );
}
