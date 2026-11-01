import { forwardRef, type ButtonHTMLAttributes } from "react";
import styles from "./MenuRow.module.css";

export const MenuRow = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(function MenuRow({ className, ...rest }, ref) {
  return <button ref={ref} type="button" {...rest} className={[styles.row, className].filter(Boolean).join(" ")} />;
});
