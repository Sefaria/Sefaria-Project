import { useEffect, useRef } from "react";
import { InterfaceText } from "../InterfaceText/InterfaceText";
import styles from "./AddToSheetView.module.css";

export const GDOC_LEARN_MORE = "https://voices.sefaria.org/sheets/529099?origin=AddToSheetsPromo";
export const GDOC_INSTALL =
  "https://workspace.google.com/marketplace/app/sefaria/849562338091?utm_source=SefariaOrg&utm_medium=SidebarAdButton&utm_campaign=AddToSheetPromotion&utm_content=InstallFromAddToSheet";

export interface GDocAdvertProps {
  /** Seen on screen (once): the old OnInView impression. */
  onSeen?: () => void;
  /** Install Now clicked: the old handleInstall (sets gdoc_installed, which hides the box from then on). */
  onInstall?: () => void;
}

/**
 * The Google Docs extension promotion under Add to Sheet (old Promotions.jsx GDocAdvertBox): a grey box, the new-extension line with
 * Learn more, and an Install Now button.
 *
 * @feature CON-057 Google Docs extension promo in Add to Sheet
 * @feature PRM-009 Google Docs add-on promo
 */
export function GDocAdvert({ onSeen, onInstall }: GDocAdvertProps) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !onSeen || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      if (!seen.current && entries.some((e) => e.isIntersecting)) {
        seen.current = true;
        onSeen();
        io.disconnect();
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, [onSeen]);
  return (
    <div ref={ref} className={styles.gdoc} data-gdoc-advert="">
      <p className={styles.gdocText}>
        <InterfaceText
          en={<>Add texts directly to your Google Docs with our <strong>new extension</strong>! <a href={GDOC_LEARN_MORE}>Learn more</a></>}
          he={<>הוסיפו טקסטים מספריא ישירות לקובץ גוגל עם <strong>התוסף החדש</strong> שלנו! <a href={GDOC_LEARN_MORE}>למדו עוד</a></>}
        />
      </p>
      <a className={styles.gdocInstall} href={GDOC_INSTALL} onClick={onInstall}>
        <InterfaceText en="Install Now" he="התקינו עכשיו" />
      </a>
    </div>
  );
}
