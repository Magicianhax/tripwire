import { capMarkers, MAX_WALLET_MARKERS, type WalletRef } from "@tripwire/core";

/** Prefer the named leaderboard entry over duplicate avatar/sidebar links further down. */
export function capWalletMarkers<T extends { ref: WalletRef; presentation?: "profile" }>(markers: T[], max = MAX_WALLET_MARKERS) {
  // capMarkers walks newest-first. Stable partitioning retains its existing policy within
  // each group while ensuring a later generic duplicate cannot displace a profile badge.
  return capMarkers([
    ...markers.filter(marker => marker.presentation !== "profile"),
    ...markers.filter(marker => marker.presentation === "profile"),
  ], max);
}
