import type { ReactNode } from "react";
import { InterfaceText } from "../InterfaceText/InterfaceText";
import { LangText } from "../LangText/LangText";
import { Link } from "../Link/Link";
import styles from "./Notification.module.css";

/** Bilingual, already-sanitised HTML (a global notification's text). */
export interface BilingualHtml {
  en?: string;
  he?: string;
}

interface Person {
  name: string;
  profileUrl: string;
  imageUrl?: string;
}

/** One notification, ready to show (the feature turns the API's record into this). */
export type NotificationView = { id: string; date: string } & (
  | { type: "index"; href: string; title: { en: string; he?: string }; text?: BilingualHtml }
  | { type: "version"; href: string; title: { en: string; he?: string }; language: "en" | "he"; version: string; text?: BilingualHtml }
  | { type: "general"; text: BilingualHtml }
  | ({ type: "sheet publish"; sheetHref: string; sheetTitle: string; summary?: string } & Person)
  | ({ type: "sheet like"; sheetHref: string; sheetTitle: string } & Person)
  | ({ type: "follow" } & Person)
  | ({ type: "collection add"; collectionHref: string; collectionName: string } & Person)
);

/** The site's own picture for a global notification (/static/img/icon.png). */
export const SITE_ICON = "/img/icon.png";

/** The old InterfaceText html: the interface side, else the other. */
function Html({ text, className }: { text: BilingualHtml; className?: string }) {
  return (
    <InterfaceText
      en={text.en ? <span className={className} dangerouslySetInnerHTML={{ __html: text.en }} /> : undefined}
      he={text.he ? <span className={className} dangerouslySetInnerHTML={{ __html: text.he }} /> : undefined}
    />
  );
}

function Frame({ image, imageHref, imageAlt, topLine, date, body }: { image?: string; imageHref?: string; imageAlt: string; topLine: ReactNode; date: string; body?: ReactNode }) {
  const img = image ? <img src={image} alt={imageAlt} /> : null;
  return (
    <div className={styles.notification} data-notification="">
      <div className={styles.imageSection} data-image-section="">{imageHref && img ? <Link href={imageHref}>{img}</Link> : img}</div>
      <div className={styles.mainSection}>
        <div className={styles.topLine}>
          <div className={styles.topLineText}>{topLine}</div>
          <div className={styles.date} suppressHydrationWarning>
            {date}
          </div>
        </div>
        {body ? <div className={styles.body}>{body}</div> : null}
      </div>
    </div>
  );
}

const userName = (p: Person) => (
  <Link href={p.profileUrl} className={styles.userName}>
    {p.name}
  </Link>
);

/**
 * One notification, the old NotificationsPanel `Notification` and its seven kinds: a new text or version and a general
 * announcement (the Library's), and the Voices kinds — a sheet published or liked, a follower, a collection — whose links go to the
 * Voices site. The image is the other reader's picture, or the site's for a global one.
 *
 * The other reader's name is the Voices green (the old .notificationUserName was --midrash-green #5d956f, 3.5:1 on white: the
 * Voices token, 4.5:1, instead).
 *
 * @feature NTF-002 Notification types and rendering
 */
export function NotificationItem({ n, he, imageAlt }: { n: NotificationView; he: boolean; imageAlt: string }) {
  switch (n.type) {
    case "index":
      return (
        <Frame
          image={SITE_ICON}
          imageAlt={imageAlt}
          date={n.date}
          topLine={
            <>
              <InterfaceText en="New Text" he="טקסט חדש" />:{" "}
              <Link href={n.href}>
                <InterfaceText en={n.title.en} he={n.title.he} />
              </Link>
            </>
          }
          body={n.text ? <div className={styles.globalText}><Html text={n.text} /></div> : undefined}
        />
      );
    case "version":
      return (
        <Frame
          image={SITE_ICON}
          imageAlt={imageAlt}
          date={n.date}
          topLine={
            he ? (
              <LangText lang="he">
                גרסה חדשה של <Link href={n.href}>{n.title.he ?? n.title.en}</Link> ב{n.language === "en" ? "אנגלית" : "עברית"} : {n.version}
              </LangText>
            ) : (
              <LangText lang="en">
                New {n.language === "en" ? "English" : "Hebrew"} version of <Link href={n.href}>{n.title.en}</Link>: {n.version}
              </LangText>
            )
          }
          body={n.text ? <div className={styles.globalText}><Html text={n.text} /></div> : undefined}
        />
      );
    case "general":
      return <Frame image={SITE_ICON} imageAlt={imageAlt} date={n.date} topLine={<div className={styles.globalText}><Html text={n.text} /></div>} />;
    case "sheet publish":
      return (
        <Frame
          image={n.imageUrl}
          imageHref={n.profileUrl}
          imageAlt={imageAlt}
          date={n.date}
          topLine={<>{userName(n)}{" "}<InterfaceText en="published a new sheet" he="פרסמ/ה דף מקורות חדש" /></>}
          body={
            <>
              <Link className={styles.sheetTitle} href={n.sheetHref}>{n.sheetTitle}</Link>
              {n.summary ? <div className={styles.sheetSummary}>{n.summary}</div> : null}
            </>
          }
        />
      );
    case "sheet like":
      return (
        <Frame
          image={n.imageUrl}
          imageHref={n.profileUrl}
          imageAlt={imageAlt}
          date={n.date}
          topLine={<>{userName(n)}{" "}<InterfaceText en="liked your sheet" he="שמר/ה את דף המקורות שלך" /></>}
          body={<Link className={styles.sheetTitle} href={n.sheetHref}>{n.sheetTitle}</Link>}
        />
      );
    case "follow":
      return (
        <Frame
          image={n.imageUrl}
          imageHref={n.profileUrl}
          imageAlt={imageAlt}
          date={n.date}
          topLine={<>{userName(n)}{" "}<InterfaceText en="is now following you" he="נרשמ/ה לעדכונים ממך" /></>}
        />
      );
    case "collection add":
      return (
        <Frame
          image={n.imageUrl}
          imageHref={n.profileUrl}
          imageAlt={imageAlt}
          date={n.date}
          topLine={<><Link href={n.profileUrl}>{n.name}</Link>{" "}<InterfaceText en="added you to a collection" he="הוסיפ/ה אותך לאסופה" /></>}
          body={<Link className={styles.collectionName} href={n.collectionHref}>{n.collectionName}</Link>}
        />
      );
  }
}

/** A list of notifications (the old .notificationsList on New Additions; the notifications page lists them bare). */
export function NotificationList({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={className ? `${styles.list} ${className}` : styles.list}>{children}</div>;
}
