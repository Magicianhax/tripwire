import { AsyncLocalStorage } from "node:async_hooks";
import { SELF_HOST_INSTALL } from "./db";

/**
 * Whose request this is, carried from the route down to `nansenPost` without threading an
 * argument through every one of the ~100 endpoint wrappers and intel builders in between.
 *
 * `installRoute` opens the scope; anything outside one (tests, scripts, the self-hosted pages)
 * reads the self-host default, which is exactly the pre-hosting behaviour.
 */
export type RequestContext = {
  install: string;
  /**
   * A Nansen key the user supplied themselves, for this request only. Never persisted: it lives
   * in this object for the lifetime of one request and nowhere else. See ADR-0014.
   */
  userKey: string | null;
};

const storage = new AsyncLocalStorage<RequestContext>();

export const withRequestContext = <T>(ctx: RequestContext, fn: () => Promise<T>): Promise<T> => storage.run(ctx, fn);

export const requestContext = (): RequestContext => storage.getStore() ?? { install: SELF_HOST_INSTALL, userKey: null };
