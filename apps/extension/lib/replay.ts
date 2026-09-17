import type { ApiResult } from "./api-result";
import type { HealthResponse } from "./api-types";

/**
 * Whether the backend runs in replay mode (recorded fixtures, not live Nansen data), asked
 * once per content-script session. A failed health check isn't cached, so a backend started
 * after the page loaded is still picked up.
 */
export function createReplayFlag(health: () => Promise<ApiResult<HealthResponse>>): () => Promise<boolean> {
  let cached: Promise<boolean> | null = null;
  return () => {
    cached ??= health().then((result) => {
      if (result.ok) return result.data.replay === true;
      cached = null;
      return false;
    });
    return cached;
  };
}
