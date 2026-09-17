import { useEffect, useMemo, useRef, useState } from "react";
import {
  AreaSeries,
  createChart,
  createSeriesMarkers,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type MouseEventParams,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Candle } from "@tripwire/core";
import type { ViewTimeframe } from "@tripwire/core";

const HEIGHT = 132;

export type ChartPoint = { time: UTCTimestamp; value: number };

/** Candles as ascending, de-duplicated close points. lightweight-charts drops out-of-order or
 * repeated timestamps silently, so the sort and the dedupe happen here where they're testable. */
export function toChartPoints(candles: Candle[] | null | undefined): ChartPoint[] {
  if (!candles) return [];
  const byTime = new Map<number, number>();
  for (const c of candles) {
    const ms = new Date(c.interval_start).getTime();
    if (!Number.isFinite(ms) || !Number.isFinite(c.close)) continue;
    byTime.set(Math.floor(ms / 1000), c.close);
  }
  return [...byTime.entries()].sort((a, b) => a[0] - b[0]).map(([time, value]) => ({ time: time as UTCTimestamp, value }));
}

/** The point closest to `iso`, or null when it falls outside the window. */
export function nearestPoint(points: ChartPoint[], iso: string | null | undefined): ChartPoint | null {
  if (!iso || points.length === 0) return null;
  const target = Math.floor(new Date(iso).getTime() / 1000);
  if (!Number.isFinite(target)) return null;
  const first = points[0]!.time;
  const last = points[points.length - 1]!.time;
  if (target < first || target > last) return null;
  let best = points[0]!;
  for (const p of points) if (Math.abs(p.time - target) < Math.abs(best.time - target)) best = p;
  return best;
}

/** A price with enough significant digits to be worth reading: memecoins trade at $0.0000021. */
export function formatPrice(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs === 0) return "$0";
  if (abs >= 1000) return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (abs >= 1) return `$${value.toFixed(2)}`;
  // Four decimals at least, and more as the price shrinks, so 0.00000212 keeps its shape.
  const digits = Math.min(12, Math.max(4, Math.ceil(-Math.log10(abs)) + 2));
  return `$${value.toFixed(digits)}`;
}

const SIGNED = (pct: number) => `${pct >= 0 ? "+" : "−"}${Math.abs(pct).toFixed(pct !== 0 && Math.abs(pct) < 1 ? 2 : 1)}%`;

/** Reads a theme token off the mounted element, so the chart's colours follow theme.css rather
 * than a second copy of the palette. */
function token(el: HTMLElement, name: string, fallback: string): string {
  const value = getComputedStyle(el).getPropertyValue(name).trim();
  return value || fallback;
}

const TIME_LABEL: Record<ViewTimeframe, Intl.DateTimeFormatOptions> = {
  "5m": { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false },
  "1h": { hour: "2-digit", minute: "2-digit", hour12: false },
  "6h": { hour: "2-digit", minute: "2-digit", hour12: false },
  "1d": { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false },
  "7d": { month: "short", day: "numeric", hour: "2-digit", hour12: false },
};

type Hover = { price: number; changePct: number; timeLabel: string; x: number } | null;

/**
 * The token's price over the selected window, as an interactive area series: hovering anywhere
 * reads out the price, the time and the change from the start of the window, and the post's own
 * moment is a marker on the line.
 *
 * Screen readers get the same three numbers as text instead of a canvas they cannot enter.
 */
export function PriceChart({
  candles,
  postTimeIso,
  timeframe,
  symbol,
}: {
  candles: Candle[] | null | undefined;
  postTimeIso?: string | null;
  timeframe: ViewTimeframe;
  symbol?: string | null;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const [hover, setHover] = useState<Hover>(null);

  const points = useMemo(() => toChartPoints(candles), [candles]);
  const open = points[0]?.value ?? null;
  const close = points[points.length - 1]?.value ?? null;
  const changePct = open !== null && open !== 0 && close !== null ? ((close - open) / open) * 100 : null;
  const down = changePct !== null && changePct < 0;
  const marker = useMemo(() => nearestPoint(points, postTimeIso), [points, postTimeIso]);

  // The chart is created once and kept: data, colours and markers are applied separately, so
  // changing the window never tears down and rebuilds the canvas.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const text2 = token(host, "--tw-text-2", "rgba(255,255,255,0.6)");
    const line = token(host, "--tw-line", "rgba(255,255,255,0.08)");
    const chart = createChart(host, {
      autoSize: true,
      height: HEIGHT,
      layout: {
        background: { color: "transparent" },
        textColor: text2,
        fontFamily: token(host, "--tw-font-ui", "system-ui, sans-serif"),
        fontSize: 11,
        attributionLogo: false,
      },
      grid: { vertLines: { visible: false }, horzLines: { color: line, style: LineStyle.Dotted } },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.15, bottom: 0.1 } },
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false, fixLeftEdge: true, fixRightEdge: true },
      crosshair: {
        mode: CrosshairMode.Magnet,
        vertLine: { color: text2, width: 1, style: LineStyle.Dashed, labelVisible: true },
        horzLine: { color: text2, width: 1, style: LineStyle.Dashed, labelVisible: true },
      },
      handleScroll: false,
      handleScale: false,
      localization: { priceFormatter: formatPrice },
    });
    chartRef.current = chart;
    seriesRef.current = chart.addSeries(AreaSeries, { priceLineVisible: false, lastValueVisible: false, lineWidth: 2 });
    return () => {
      markersRef.current = null;
      seriesRef.current = null;
      chartRef.current = null;
      chart.remove();
    };
  }, []);

  // Colour follows the window's direction: mint when the price rose over it, red when it fell.
  useEffect(() => {
    const host = hostRef.current;
    const series = seriesRef.current;
    if (!host || !series) return;
    const stroke = down ? token(host, "--tw-red", "#ff5a6e") : token(host, "--tw-mint", "#00ffa7");
    series.applyOptions({
      lineColor: stroke,
      topColor: down ? "rgba(255, 90, 110, 0.28)" : "rgba(0, 255, 167, 0.24)",
      bottomColor: "rgba(0, 0, 0, 0)",
    });
  }, [down]);

  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart) return;
    series.setData(points);
    chart.timeScale().fitContent();
  }, [points]);

  useEffect(() => {
    const host = hostRef.current;
    const series = seriesRef.current;
    if (!host || !series) return;
    const list = marker
      ? [{ time: marker.time as Time, position: "inBar" as const, shape: "circle" as const, color: token(host, "--tw-text", "#ffffff"), size: 1, text: "Post" }]
      : [];
    markersRef.current ??= createSeriesMarkers(series, []);
    markersRef.current.setMarkers(list);
  }, [marker]);

  // Hover readout. The crosshair callback fires with an undefined time outside the data range.
  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) return;
    const format = new Intl.DateTimeFormat("en-GB", { ...TIME_LABEL[timeframe], timeZone: "UTC" });
    const onMove = (param: MouseEventParams<Time>) => {
      const data = param.time === undefined ? undefined : param.seriesData.get(series);
      const value = data && "value" in data ? (data.value as number) : undefined;
      if (value === undefined || !param.point) {
        setHover(null);
        return;
      }
      setHover({
        price: value,
        changePct: open !== null && open !== 0 ? ((value - open) / open) * 100 : 0,
        timeLabel: typeof param.time === "number" ? `${format.format(new Date(param.time * 1000))} UTC` : String(param.time),
        x: param.point.x,
      });
    };
    chart.subscribeCrosshairMove(onMove);
    return () => {
      chart.unsubscribeCrosshairMove(onMove);
      setHover(null);
    };
  }, [open, timeframe]);

  if (points.length < 2) return null;

  const summary = `${symbol ? `${symbol}: ` : ""}opened ${formatPrice(open!)}, closed ${formatPrice(close!)}, ${
    changePct === null ? "unchanged" : `${changePct < 0 ? "down" : "up"} ${Math.abs(changePct).toFixed(1)}%`
  } over ${timeframe}.${marker ? " The post's own moment is marked on the line." : ""}`;

  return (
    <div className="tw-chart" onMouseLeave={() => setHover(null)}>
      <div className="tw-chart-canvas" ref={hostRef} style={{ height: HEIGHT }} aria-hidden="true" />
      {hover ? (
        <div className="tw-chart-tip" style={{ left: `${hover.x}px` }} aria-hidden="true">
          <span className="tw-fig tw-chart-tip-price">{formatPrice(hover.price)}</span>
          <span className="tw-fig" data-sign={hover.changePct < 0 ? "neg" : "pos"}>
            {SIGNED(hover.changePct)}
          </span>
          <span className="tw-chart-tip-time tw-fig">{hover.timeLabel}</span>
        </div>
      ) : null}
      <p className="tw-sr-only">{summary}</p>
    </div>
  );
}
