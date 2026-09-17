import type { LabelKind, Verdict } from "@tripwire/core";
import {
  Bot,
  Brain,
  Building2,
  CircleDashed,
  Fish,
  Landmark,
  LoaderCircle,
  Megaphone,
  OctagonX,
  ShieldCheck,
  TriangleAlert,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";

/** One icon system: Lucide at an absolute 1.5px stroke in currentColor, 14–16px, always
 * decorative (the control or the text next to it carries the accessible name). */
export function Icon({ icon: I, size = 16, className }: { icon: LucideIcon; size?: 12 | 14 | 16 | 20; className?: string }) {
  return (
    <I
      className={className ? `tw-icon ${className}` : "tw-icon"}
      size={size}
      strokeWidth={1.5}
      absoluteStrokeWidth
      aria-hidden="true"
      focusable="false"
    />
  );
}

export function CloseIcon() {
  return <Icon icon={X} size={16} />;
}

/** The verdict's shape, so no verdict is told apart by colour alone. UNCHECKED is a dashed
 * circle, never the CLEAR shield. */
export const VERDICT_ICON: Record<Verdict | "LOADING", LucideIcon> = {
  TRIPWIRE: OctagonX,
  CAUTION: TriangleAlert,
  CLEAR: ShieldCheck,
  UNCHECKED: CircleDashed,
  LOADING: LoaderCircle,
};

/** The wallet kind a Nansen label names (see cleanLabel). */
export const LABEL_KIND_ICON: Record<LabelKind, LucideIcon> = {
  "smart-trader": Brain,
  fund: Landmark,
  whale: Fish,
  "public-figure": Megaphone,
  exchange: Building2,
  bot: Bot,
  other: Wallet,
};
