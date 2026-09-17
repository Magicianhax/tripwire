import { meterFill, meterTicks } from "../_lib/meter";

/** A tick-scale gauge: ground-glass track with quarter ticks and mono scale figures. At zero a
 * lit needle sits on the zero tick, so an empty meter reads as "zero", not as a missing bar. */
export function Meter({ label, value, max }: { label: string; value: number; max: number }) {
  const { pct, zero } = meterFill(value, max);
  const ticks = meterTicks(max);
  return (
    <div className="tw-meter">
      <div
        className="tw-meter-track"
        data-zero={zero ? "" : undefined}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={Math.min(value, max)}
        aria-valuetext={`${value} of ${max}`}
      >
        <i className="tw-meter-fill" style={{ width: `${pct}%` }} />
        {ticks.map((t, i) => (
          <i key={t} className="tw-meter-tick" data-major={i % 2 === 0 ? "" : undefined} style={{ left: `${(i / (ticks.length - 1)) * 100}%` }} />
        ))}
      </div>
      <div className="tw-meter-scale" aria-hidden="true">
        {ticks.map((t, i) => (
          <span key={t} className="tw-data" style={{ left: `${(i / (ticks.length - 1)) * 100}%` }} data-edge={i === 0 ? "start" : i === ticks.length - 1 ? "end" : undefined}>
            {t.toLocaleString("en-US")}
          </span>
        ))}
      </div>
    </div>
  );
}
