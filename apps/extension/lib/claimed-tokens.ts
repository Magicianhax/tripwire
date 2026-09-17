/**
 * Addresses this page's other Tripwire surfaces have already claimed as *tokens*.
 *
 * A contract address is not somebody's wallet, and a page where the chip or the block screen is
 * already saying everything there is to say about a token must not also grow a wallet marker on
 * it. The X content script claims the token it resolved for a post; the venue adapters claim
 * the page's own target.
 *
 * Every content script of one extension shares a single isolated world per frame, so a plain
 * global is the whole mechanism — no messaging, no ordering requirement. The wallet lens reads
 * it on every scan and retires a marker whose address is claimed after the fact, which is what
 * makes the race harmless: the chip resolves its token asynchronously, and the marker that
 * briefly existed is taken back on the next pass.
 */

const KEY = "__tripwireClaimedTokens";

type Holder = { [KEY]?: Set<string> };

function store(): Set<string> {
  const holder = globalThis as unknown as Holder;
  return (holder[KEY] ??= new Set<string>());
}

export function claimToken(address: string | null | undefined): void {
  if (address) store().add(address.toLowerCase());
}

export function isTokenClaimed(address: string | null | undefined): boolean {
  return address ? store().has(address.toLowerCase()) : false;
}

/** Test helper. */
export function _resetClaimedTokens(): void {
  store().clear();
}
