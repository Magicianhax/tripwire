import { depthCost, DepthRequestSchema, VERDICT_TIMEFRAME, type DepthSection, type Target } from "@tripwire/core";
import { preflight, route } from "@/lib/http";
import {
  perpChartSection,
  perpMarketSection,
  perpTradersSection,
  perpVenuesSection,
  predictionBookSection,
  spotHoldersSection,
  type PerpChartSection,
  type PerpMarketSection,
  type PerpTradersSection,
  type PerpVenuesSection,
  type PredictionBookSection,
  type SpotHoldersSection,
} from "@/lib/intel/depth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export type DepthResponse = {
  perpMarket?: PerpMarketSection;
  perpVenues?: PerpVenuesSection;
  perpTraders?: PerpTradersSection;
  perpChart?: PerpChartSection;
  spotHolders?: SpotHoldersSection;
  predictionBook?: PredictionBookSection;
  /** What the sections in this answer are priced at, for the card's footer. */
  credits: number;
  /** A section asked for that this target can't have ("perpTraders" on a spot token). */
  skipped: DepthSection[];
};

/**
 * The card's lazy sections. Nothing here runs on a card open: a tab asks for exactly what it
 * draws, each section settles on its own, and a section that fails comes back with a named
 * reason rather than taking the others with it.
 *
 * A section that doesn't apply to the target is reported in `skipped` rather than silently
 * dropped, so a mismatch is visible in the card instead of looking like a slow load.
 */
async function build(target: Target, sections: DepthSection[], timeframe: string): Promise<DepthResponse> {
  const wanted = new Set(sections);
  const skipped: DepthSection[] = [];
  const out: DepthResponse = { credits: 0, skipped };

  const applies = (section: DepthSection, kind: Target["kind"]): boolean => {
    const ok = section.startsWith("perp") ? kind === "perp" : section.startsWith("spot") ? kind === "spot" : kind === "prediction";
    if (!ok) skipped.push(section);
    return ok;
  };

  const jobs: Promise<void>[] = [];

  if (target.kind === "perp") {
    const coin = target.coin.toUpperCase();
    if (wanted.has("perpMarket") && applies("perpMarket", target.kind)) jobs.push(perpMarketSection(coin).then((s) => void (out.perpMarket = s)));
    if (wanted.has("perpVenues") && applies("perpVenues", target.kind)) jobs.push(perpVenuesSection(coin).then((s) => void (out.perpVenues = s)));
    if (wanted.has("perpTraders") && applies("perpTraders", target.kind)) jobs.push(perpTradersSection(coin).then((s) => void (out.perpTraders = s)));
    if (wanted.has("perpChart") && applies("perpChart", target.kind)) jobs.push(perpChartSection(coin, timeframe).then((s) => void (out.perpChart = s)));
  } else {
    for (const s of sections) if (s.startsWith("perp")) skipped.push(s);
  }

  if (target.kind === "spot" && wanted.has("spotHolders")) {
    jobs.push(spotHoldersSection(target.chain, target.tokenAddress).then((s) => void (out.spotHolders = s)));
  } else if (wanted.has("spotHolders")) {
    skipped.push("spotHolders");
  }

  if (wanted.has("predictionBook")) {
    if (target.kind === "prediction" && target.marketId) jobs.push(predictionBookSection(target.marketId).then((s) => void (out.predictionBook = s)));
    else skipped.push("predictionBook");
  }

  await Promise.all(jobs);
  const delivered = sections.filter((s) => !skipped.includes(s));
  out.credits = depthCost(delivered);
  return out;
}

export const POST = route(DepthRequestSchema, async (_req, body) => build(body.target, body.sections, body.timeframe ?? VERDICT_TIMEFRAME));
