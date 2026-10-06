import { forwardRef, type ButtonHTMLAttributes, type MouseEvent, type ReactNode } from "react";
import { Link } from "../Link/Link";
import { Spinner } from "../Spinner/Spinner";
import styles from "./Button.module.css";

export type ButtonVariant = "primary" | "secondary" | "tertiary" | "danger";
export type ButtonSize = "sm" | "md" | "lg" | "xl";

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  /** Shows a spinner and blocks activation (the button stays focusable and keeps its width). */
  loading?: boolean;
  children?: ReactNode;
  className?: string;
}

export type ButtonProps = CommonProps &
  (
    | ({ href?: undefined } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "className">)
    | ({ href: string } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "children" | "className">)
  );

/**
 * The one button. Renders `<button>` for actions and `<a>` (via the injected Link) when `href` is given,
 * so navigation is announced as a link and works with open-in-new-tab. Replaces the old client's
 * `.button`, `.btn`, `.sefaria-common-button`, `.sidebarButton` and `Button` (common/Button.jsx).
 *
 * Disabled uses `aria-disabled` rather than the `disabled` attribute so the control stays discoverable
 * by keyboard and screen readers; activation is blocked in the handler.
 */
export const Button = forwardRef<HTMLButtonElement & HTMLAnchorElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", block, loading, className, children, ...rest },
  ref,
) {
  const cls = [styles.button, styles[variant], size !== "md" && styles[size], block && styles.block, className].filter(Boolean).join(" ");
  const content = (
    <>
      {loading ? <Spinner size="1em" label="" /> : null}
      {children}
    </>
  );

  if ("href" in rest && rest.href !== undefined) {
    const { href, onClick, ...anchor } = rest as { href: string; onClick?: (e: MouseEvent<HTMLAnchorElement>) => void } & Record<string, unknown>;
    const blocked = Boolean(loading || (anchor as { "aria-disabled"?: boolean })["aria-disabled"]);
    return (
      <Link
        {...(anchor as object)}
        ref={ref as never}
        href={href}
        className={cls}
        aria-disabled={blocked || undefined}
        aria-busy={loading || undefined}
        onClick={(e) => {
          if (blocked) return e.preventDefault();
          onClick?.(e);
        }}
      >
        {content}
      </Link>
    );
  }

  const { onClick, disabled, type = "button", ...button } = rest as ButtonHTMLAttributes<HTMLButtonElement>;
  const blocked = Boolean(loading || disabled);
  return (
    <button
      {...button}
      ref={ref}
      type={type}
      className={cls}
      aria-disabled={blocked || undefined}
      aria-busy={loading || undefined}
      onClick={(e) => {
        if (blocked) return e.preventDefault();
        onClick?.(e);
      }}
    >
      {content}
    </button>
  );
});
