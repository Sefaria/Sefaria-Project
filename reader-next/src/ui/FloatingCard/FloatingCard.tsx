import { forwardRef, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from "react";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import { Icon, type IconName } from "../Icon/Icon";
import { IconButton } from "../IconButton/IconButton";
import styles from "./FloatingCard.module.css";

const cx = (...c: (string | undefined | false)[]) => c.filter(Boolean).join(" ");

/** The frame of a card floating over the text. Position, size and portal are the caller's; it is a dialog by default. */
export const FloatingCard = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function FloatingCard({ className, ...rest }, ref) {
  return <div ref={ref} role="dialog" {...rest} className={cx(styles.card, className)} />;
});

/** The card's title row: whatever names the card, then its close button. */
export function FloatingCardHeader({ children, onClose, className, ...rest }: HTMLAttributes<HTMLElement> & { onClose: () => void }) {
  const he = useInterfaceLang() === "hebrew";
  return (
    <header {...rest} className={cx(styles.header, className)}>
      {children}
      <IconButton icon="close" size="sm" label={he ? "סגירה" : "Close"} onClick={onClose} />
    </header>
  );
}

export function FloatingCardFooter({ className, ...rest }: HTMLAttributes<HTMLElement>) {
  return <footer {...rest} className={cx(styles.footer, className)} />;
}

type ActionProps = { icon: IconName; children: ReactNode } & (
  | ({ href: string } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "children" | "className">)
  | ({ href?: undefined } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "className">)
);

/** A footer action: a 16px icon and its label, a link when it has an `href`. */
export function FloatingCardAction({ icon, children, ...rest }: ActionProps) {
  const content = (
    <>
      <Icon name={icon} size="16px" />
      {children}
    </>
  );
  if (rest.href !== undefined) return <a {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)} className={styles.action}>{content}</a>;
  return <button type="button" {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)} className={styles.action}>{content}</button>;
}
