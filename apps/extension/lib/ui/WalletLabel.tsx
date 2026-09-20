import { cleanLabel, isEvmAddress, isSolanaAddress, nansenWalletUrl } from "@tripwire/core";
import { shortAddr } from "./format";
import { Icon, LABEL_KIND_ICON } from "./icons";
import { NansenRowLink } from "./NansenRowLink";

/** A wallet as Nansen names it: the label without its emoji, prefixed by an icon for the kind of
 * wallet it names; an unlabeled wallet shows its short address in mono. */
export function WalletLabel({ label, address, chain }: { label: string | null | undefined; address: string; chain?: string | null }) {
  const clean = label ? cleanLabel(label) : null;
  const href = isEvmAddress(address) || isSolanaAddress(address) ? nansenWalletUrl(address, chain) : null;
  if (!clean || clean.text === "") {
    return (
      <span className="tw-wallet" data-kind="other">
        <Icon icon={LABEL_KIND_ICON.other} size={14} />
        <span className="tw-row-name tw-mono">{shortAddr(address)}</span>
        <NansenRowLink href={href} subject={shortAddr(address)} />
      </span>
    );
  }
  return (
    <span className="tw-wallet" data-kind={clean.kind}>
      <Icon icon={LABEL_KIND_ICON[clean.kind]} size={14} />
      <span className="tw-row-name">{clean.text}</span>
      <NansenRowLink href={href} subject={`${clean.text} (${shortAddr(address)})`} />
    </span>
  );
}
