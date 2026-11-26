import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { cx } from './cx';
import { ExternalLink } from './ExternalLink';
import styles from './Button.module.css';

export type ButtonVariant =
  | 'primary' // navy fill
  | 'outline' // navy outline
  | 'text' // navy text only
  | 'accent' // purple fill (project CTA)
  | 'accent-outline' // purple outline
  | 'inverse' // white fill, purple text (on purple)
  | 'inverse-outline'; // white outline (on purple)
export type ButtonSize = 'md' | 'lg' | 'xl';

/** CSS Module class of each variant: module class names are camelCase (contract C5). */
const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'primary',
  outline: 'outline',
  text: 'text',
  accent: 'accent',
  'accent-outline': 'accentOutline',
  inverse: 'inverse',
  'inverse-outline': 'inverseOutline',
};

interface Common {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  icon?: ReactNode;
  className?: string;
}

function classes({ variant = 'primary', size = 'md', fullWidth, className }: Common) {
  return cx(styles.button, styles[VARIANT_CLASS[variant]], styles[size], fullWidth && styles.full, className);
}

export function Button({
  variant,
  size,
  fullWidth,
  icon,
  className,
  children,
  type = 'button',
  ...rest
}: Common & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type={type} className={classes({ variant, size, fullWidth, className })} {...rest}>
      {icon}
      {children}
    </button>
  );
}

/** A same-looking link that leaves the site. Shows the external arrow by default. */
export function ButtonLink({
  variant,
  size,
  fullWidth,
  icon,
  className,
  children,
  href,
  arrow = true,
  onClick,
}: Common & {
  href: string;
  children: ReactNode;
  arrow?: boolean;
  onClick?: () => void;
}) {
  return (
    <ExternalLink href={href} className={classes({ variant, size, fullWidth, className })} onClick={onClick}>
      {icon}
      {children}
      {arrow && <ArrowUpRight size={size === 'xl' ? 24 : 18} strokeWidth={2} aria-hidden="true" />}
    </ExternalLink>
  );
}
