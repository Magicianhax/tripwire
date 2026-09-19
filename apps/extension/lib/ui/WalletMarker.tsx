import { NANSEN_LOGO, type WalletRef } from "@tripwire/core";
import { shortAddr } from "./format";
import { BrandMark } from "./Logo";
import { Tooltip } from "./Tooltip";

/** How a ref reads out loud: a name as itself, an address shortened. */
export const refLabel = (ref: WalletRef): string => (ref.kind === "ens" || ref.kind === "sns" ? ref.query : shortAddr(ref.query));

/**
 * The 14px Nansen mark that appears beside a wallet somebody shared. It is a real button, not a
 * glyph: it names the wallet it belongs to, so a screen reader hearing forty of them on a page
 * can still tell them apart, and its hit target is 24px through a pseudo-element while the mark
 * itself stays 14px and out of the host's way.
 */
export function WalletMarker({ ref: walletRef, open, onClick }: { ref: WalletRef; open: boolean; onClick: () => void }) {
  const label = `Inspect wallet ${refLabel(walletRef)} with Tripwire`;
  return (
    <Tooltip label={label}>
      {(labelId) => (
        <button
          type="button"
          className="tw-wallet-marker"
          aria-labelledby={labelId}
          aria-expanded={open}
          data-open={open ? "" : undefined}
          onClick={onClick}
        >
          <BrandMark logo={NANSEN_LOGO} size={14} />
        </button>
      )}
    </Tooltip>
  );
}
