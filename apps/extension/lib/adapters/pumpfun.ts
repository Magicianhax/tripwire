import type { Target } from "@tripwire/core";
import { solanaTarget } from "./chains";
import { findButton } from "./dom";
import { OVERRIDE_PHRASES, type VenueAdapter } from "./types";

const COIN_PATH_RE = /^\/coin\/([^/]+)/;
const ANCHOR_RE = /place trade|buy/i;

export const pumpfunAdapter: VenueAdapter = {
  id: "pumpfun",
  tier: 1,
  match(url) {
    return url.hostname === "pump.fun" && COIN_PATH_RE.test(url.pathname);
  },
  readTarget(_doc, url): Target | null {
    const match = COIN_PATH_RE.exec(url.pathname);
    return solanaTarget(match?.[1]);
  },
  anchor(doc) {
    return findButton(doc, ANCHOR_RE);
  },
  overridePhrase: OVERRIDE_PHRASES.spot,
};
