import { useId, type ReactNode } from "react";

/**
 * An explanatory label for an icon-only control. The trigger receives the tooltip id so
 * assistive technology gets the same explanation that appears on hover or keyboard focus.
 */
export function Tooltip({
  label,
  align = "center",
  placement = "top",
  children,
}: {
  label: string;
  align?: "center" | "end";
  placement?: "top" | "bottom";
  children: (labelId: string) => ReactNode;
}) {
  const labelId = useId();
  return (
    <span className="tw-tooltip" data-align={align} data-placement={placement}>
      {children(labelId)}
      <span id={labelId} className="tw-tooltip-content" role="tooltip">
        {label}
      </span>
    </span>
  );
}
