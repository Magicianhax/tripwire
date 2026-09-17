import { cleanLabel } from "@tripwire/core";
import { shortAddr } from "./format";
import { Icon, LABEL_KIND_ICON } from "./icons";

/** A wallet as Nansen names it: the label without its emoji, prefixed by an icon for the kind of
 * wallet it names; an unlabeled wallet shows its short address in mono. */
export function WalletLabel({ label, address }: { label: string | null | undefined; address: string }) {
  const clean = label ? cleanLabel(label) : null;
  if (!clean || clean.text === "") {
    return (
      <span className="tw-wallet" data-kind="other">
        <Icon icon={LABEL_KIND_ICON.other} size={14} />
        <span className="tw-row-name tw-mono">{shortAddr(address)}</span>
      </span>
    );
  }
  return (
    <span className="tw-wallet" data-kind={clean.kind}>
      <Icon icon={LABEL_KIND_ICON[clean.kind]} size={14} />
      <span className="tw-row-name">{clean.text}</span>
    </span>
  );
}
