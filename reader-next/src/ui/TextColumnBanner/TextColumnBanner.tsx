import { useState, type ReactNode } from "react";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import { Button } from "../Button/Button";
import { IconButton } from "../IconButton/IconButton";
import styles from "./TextColumnBanner.module.css";

export interface BannerAction {
  label: ReactNode;
  /** Plain-text name for assistive technology. */
  name: string;
  onClick: () => void;
}
export interface TextColumnBannerProps {
  children: ReactNode;
  actions?: readonly BannerAction[];
  /** Called when the banner goes away (after an action or the close button). */
  onClose?: () => void;
}

/**
 * A strip above the text that tells the reader about something they can do ("Want to change the translation?"), with
 * buttons and a close button. Doing any of it closes the strip. Replaces TextColumnBanner / TextColumnBannerButton.
 *
 * @feature TXD-064 Open translations banner
 */
export function TextColumnBanner({ children, actions = [], onClose }: TextColumnBannerProps) {
  const lang = useInterfaceLang();
  const [closed, setClosed] = useState(false);
  if (closed) return null;
  const close = () => {
    setClosed(true);
    onClose?.();
  };
  return (
    <div className={styles.banner} role="region" aria-label={lang === "hebrew" ? "הצעה" : "Suggestion"} lang={lang === "hebrew" ? "he" : "en"}>
      <p className={styles.message}>{children}</p>
      <div className={styles.buttons}>
        {actions.map((a) => (
          <Button
            key={a.name}
            variant="secondary"
            size="sm"
            onClick={() => {
              a.onClick();
              close();
            }}
          >
            {a.label}
          </Button>
        ))}
      </div>
      <div className={styles.close}><IconButton icon="close" label={lang === "hebrew" ? "סגירת ההצעה" : "Close suggestion"} onClick={close} /></div>
    </div>
  );
}
