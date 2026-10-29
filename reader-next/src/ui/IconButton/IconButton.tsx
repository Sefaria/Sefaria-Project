import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Icon, type IconName } from "../Icon/Icon";
import styles from "./IconButton.module.css";

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "aria-label"> {
  icon: IconName;
  /** Required: an icon-only control must have an accessible name (the old client shipped many without). */
  label: string;
  /** For toggles (save, bookmark): reflects state via `aria-pressed` and fills the icon. */
  pressed?: boolean;
  size?: "sm" | "md";
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, pressed, size = "md", className, disabled, onClick, type = "button", ...rest },
  ref,
) {
  return (
    <button
      {...rest}
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      aria-disabled={disabled || undefined}
      className={[styles.iconButton, size === "sm" && styles.sm, className].filter(Boolean).join(" ")}
      onClick={(e) => (disabled ? e.preventDefault() : onClick?.(e))}
    >
      <Icon name={icon} filled={pressed} size="1.3em" />
    </button>
  );
});
