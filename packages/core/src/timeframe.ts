export type FlowTimeframe = "5m" | "1h" | "6h" | "12h" | "1d" | "7d";

const STEPS: [FlowTimeframe, number][] = [
  ["5m", 5 * 60_000],
  ["1h", 60 * 60_000],
  ["6h", 6 * 3_600_000],
  ["12h", 12 * 3_600_000],
  ["1d", 24 * 3_600_000],
];

/** Smallest Flow Intelligence window that covers the post's age (capped at 7d). */
export function pickFlowTimeframe(ageMs: number): FlowTimeframe {
  for (const [tf, ms] of STEPS) if (ageMs <= ms) return tf;
  return "7d";
}

/** The windows the card's segmented control offers. The verdict never uses these: it is always
 * computed on VERDICT_TIMEFRAME, so switching the view can't change a CLEAR into a TRIPWIRE. */
export const VIEW_TIMEFRAMES = ["5m", "1h", "6h", "1d", "7d"] as const;
export type ViewTimeframe = (typeof VIEW_TIMEFRAMES)[number];

/** Flow Intelligence's fresh-wallet segment only exists for 1d and 7d, and every preset
 * threshold in docs/CALIBRATION.md was measured on the 1d window. */
export const VERDICT_TIMEFRAME: ViewTimeframe = "1d";

export const MS_PER_TIMEFRAME: Record<ViewTimeframe, number> = {
  "5m": 5 * 60_000,
  "1h": 60 * 60_000,
  "6h": 6 * 3_600_000,
  "1d": 24 * 3_600_000,
  "7d": 7 * 24 * 3_600_000,
};

/** Candle interval per view window, so every window draws roughly 60–170 points. */
export const CANDLE_INTERVAL: Record<ViewTimeframe, string> = {
  "5m": "1m",
  "1h": "1m",
  "6h": "5m",
  "1d": "15m",
  "7d": "1h",
};

export function isViewTimeframe(value: unknown): value is ViewTimeframe {
  return typeof value === "string" && (VIEW_TIMEFRAMES as readonly string[]).includes(value);
}

/** The Smart Money netflow tiles (1h/24h/7d/30d) drive the same control; 30d has no flow window
 * of its own, so it maps to 7d and the tile says so. */
export const NETFLOW_TILE_TIMEFRAME: Record<"h1" | "h24" | "d7" | "d30", ViewTimeframe> = {
  h1: "1h",
  h24: "1d",
  d7: "7d",
  d30: "7d",
};

/** The card's opening window: the smallest offered window that covers the post's age (venues,
 * which have no post, pass null and get the verdict window). */
export function defaultViewTimeframe(ageMs: number | null | undefined): ViewTimeframe {
  if (typeof ageMs !== "number" || !Number.isFinite(ageMs)) return VERDICT_TIMEFRAME;
  for (const tf of VIEW_TIMEFRAMES) if (ageMs <= MS_PER_TIMEFRAME[tf]) return tf;
  return "7d";
}
