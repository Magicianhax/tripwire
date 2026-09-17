import { isVenueWalletAddress, type WalletVenue } from "@tripwire/core";

export type ParsedAddress = { ok: true; address: string } | { ok: false; error: string };

/** The link form's own check, so a typo is named in the form instead of coming back as a 400. */
export function parseLinkAddress(venue: WalletVenue, raw: string): ParsedAddress {
  const address = raw.trim();
  if (address === "") return { ok: false, error: "Paste the wallet address." };
  if (!isVenueWalletAddress(venue, address)) return { ok: false, error: "That isn't an address: 0x and 40 hex characters." };
  return { ok: true, address: address.toLowerCase() };
}
