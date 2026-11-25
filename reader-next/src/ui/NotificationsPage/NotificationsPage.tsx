import type { MouseEvent, ReactNode } from "react";
import { InterfaceText } from "../InterfaceText/InterfaceText";
import { NavPage } from "../NavPage/NavPage";
import styles from "./NotificationsPage.module.css";

export interface NotificationsPageProps {
  he: boolean;
  /** The list (NotificationItem rows), or undefined while it loads. An empty array is the old "no notifications yet" message. */
  children?: ReactNode[];
  sidebar?: ReactNode;
  footer?: ReactNode;
  /** After the list: what loads the next page. */
  sentinel?: ReactNode;
  /** Shown while the list loads. */
  loading?: ReactNode;
  /** A click inside the list (links in an announcement's text). */
  onListClick?: (e: MouseEvent<HTMLDivElement>) => void;
}

/**
 * The notifications page (the old NotificationsPanel): a bell and "Notifications", then the reader's notifications, newest first, or
 * the old message when there are none; the sidebar holds Stay Connected and the promotion slot.
 *
 * @feature NTF-001 Notifications page
 */
export function NotificationsPage({ he, children, sidebar, footer, sentinel, loading, onListClick }: NotificationsPageProps) {
  return (
    <NavPage sidebar={sidebar} footer={footer} top={{ main: 60, side: 60 }}>
      <div className={styles.top}>
        <div className={styles.headerBox}>
          <h1 className={styles.title}>
            <img className={styles.icon} src="/icons/notification.svg" alt={he ? "סמל התראה" : "Notification icon"} />
            <InterfaceText en="Notifications" he="התראות" />
          </h1>
        </div>
      </div>
      {children === undefined ? (
        loading
      ) : children.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyTitle} aria-label={he ? "כותרת הודעת אין התראות" : "No notifications message title"}>
            <InterfaceText en="Looks like you don’t have any notifications yet." he="נראה שעדיין אין לך התראות" />
          </div>
          <div className={styles.emptyMessage} aria-label={he ? "גוף הודעת אין התראות" : "No notifications message body"}>
            <InterfaceText en="Try following sheet creators to get notified when they publish a new sheet." he="מומלץ לעקוב אחרי יוצרים של דפי מקורות כדי לקבל התראה כאשר יפרסמו דף מקורות חדש" />
          </div>
        </div>
      ) : (
        <div onClick={onListClick}>{children}</div>
      )}
      {sentinel}
    </NavPage>
  );
}
