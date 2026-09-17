export type Sourced<T> = { value: T | null; error: string | null; cached: boolean; stale: boolean };

/** Run a data fetch; failures become null so one endpoint never sinks the whole check. */
export async function settle<R extends { data: unknown; cached: boolean; stale: boolean }, T>(
  p: Promise<R>,
  pick: (data: R["data"]) => T | null | undefined,
): Promise<Sourced<T>> {
  try {
    const r = await p;
    return { value: pick(r.data) ?? null, error: null, cached: r.cached, stale: r.stale };
  } catch (e) {
    return { value: null, error: e instanceof Error ? e.message : String(e), cached: false, stale: false };
  }
}

export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]!);
    }
  });
  await Promise.all(workers);
  return out;
}

export const isoNoMs = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");
