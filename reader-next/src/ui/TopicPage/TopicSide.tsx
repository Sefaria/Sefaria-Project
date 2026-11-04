import { useState, type ReactNode } from "react";
import { langCode, useInterfaceLang } from "~/lib/i18n/interface-lang";
import { InterfaceText } from "../InterfaceText/InterfaceText";
import { Link } from "../Link/Link";
import { SidebarModule } from "../NavSidebar/NavSidebar";
import { InterfaceMarkdown } from "../TopicsNav/TopicCard";
import { TopicImage, type BilingualText, type MaybeBilingual } from "./TopicPage";
import styles from "./TopicPage.module.css";
import nav from "../NavSidebar/NavSidebar.module.css";
import tm from "../NavSidebar/TopicModules.module.css";

/** TopicSideSection: a titled list showing its first ten links, then More / Less. */
export function SideSection({ title, children, limit = 10, className }: { title: MaybeBilingual; children?: ReactNode[]; limit?: number; className?: string }) {
  const [more, setMore] = useState(false);
  const items = children ?? [];
  const hasMore = items.length > limit;
  const label = more ? "Less" : "More";
  return (
    <div className={`${styles.section} ${className ?? ""}`}>
      <h2 className={styles.sectionTitle}>
        <InterfaceText en={title.en} he={title.he} />
      </h2>
      <div className={styles.sideList}>{more ? items : items.slice(0, limit)}</div>
      {hasMore ? (
        <button type="button" className={styles.more} onClick={() => setMore(!more)} data-anl-event="related_click:click" data-anl-batch={JSON.stringify({ text: label, feature_name: "more" })}>
          <InterfaceText en={label} he={more ? "פחות" : "עוד"} />
        </button>
      ) : null}
    </div>
  );
}

export interface SideTopicLink {
  href: string;
  title: BilingualText;
}

export interface ReadingsData {
  date: { en: string; he: string };
  hebrewDate: { en: string; he: string };
  torah: { href: string; en: string; he: string };
  aliyot: { href: string; ref: string; en: string; he: string }[];
  haftarot: { href: string; en: string; he: string }[];
}

export interface TopicSideColumnProps {
  image?: { uri: string; caption: MaybeBilingual };
  lived?: { name: MaybeBilingual; yearRange: MaybeBilingual };
  learnMore: { url: string; en: string; he: string }[];
  readings?: ReadingsData;
  sections: { title: BilingualText; links: SideTopicLink[] }[];
}

/**
 * TopicSideColumn: the picture (a wide screen), "Lived" (a person's time and years), "Learn More" (Wikipedia, the Jewish Encyclopedia,
 * the National Library of Israel), Readings (a Torah portion) and the related-topic groups.
 *
 * @feature TOP-025 Topic side column: metadata and links
 * @feature TOP-026 Parasha readings panel
 */
export function TopicSideColumn({ image, lived, learnMore, readings, sections }: TopicSideColumnProps) {
  return (
    <div className={styles.sideInner}>
      {image ? <TopicImage uri={image.uri} caption={image.caption} place="side" /> : null}
      {lived ? (
        <SideSection title={{ en: "Lived", he: "תקופת פעילות" }}>
          {[
            <div key="name" className={styles.meta}>
              <InterfaceText en={lived.name.en} he={lived.name.he} />
            </div>,
            <div key="years" className={styles.meta}>
              <InterfaceText en={lived.yearRange.en} he={lived.yearRange.he} />
            </div>,
          ]}
        </SideSection>
      ) : null}
      {learnMore.length ? (
        <SideSection title={{ en: "Learn More", he: "לקריאה נוספת" }}>
          {learnMore.map((l) => (
            <div key={l.url} data-anl-event="related_click:click" data-anl-batch={JSON.stringify({ text: l.en, feature_name: "description link learn more" })}>
              <div>
                <a className={styles.meta} href={l.url} target="_blank" rel="noopener noreferrer" data-target-module="library">
                  <InterfaceText en={l.en} he={l.he} />
                </a>
              </div>
            </div>
          ))}
        </SideSection>
      ) : null}
      {readings ? <Readings {...readings} /> : null}
      {sections.map((s) => (
        <SideSection key={s.title.en + s.title.he} title={s.title}>
          {s.links.map((l) => (
            <div key={l.href} data-anl-event="related_click:click" data-anl-batch={JSON.stringify({ text: l.title.en, feature_name: "related topic" })}>
              <Link className={styles.related} href={l.href} title={l.title.en}>
                <InterfaceText en={l.title.en} he={l.title.he} />
              </Link>
            </div>
          ))}
        </SideSection>
      ))}
    </div>
  );
}

/** ReadingsComponent: the next reading's date (Gregorian • Hebrew), the Torah reading with its aliyot, and the haftarah. */
function Readings({ date, hebrewDate, torah, aliyot, haftarot }: ReadingsData) {
  const lang = langCode(useInterfaceLang());
  const book = <img src="/icons/book.svg" alt={lang === "he" ? "סמל ספר" : "book icon"} />;
  return (
    <div className={`${styles.section} ${styles.readings}`}>
      <h2 className={styles.sectionTitle}>
        <InterfaceText en="Readings" he="פרשיות והפטרות" />
      </h2>
      <span className={styles.date}>
        <InterfaceText en={date.en} he={date.he} />
        <InterfaceText en={hebrewDate.en} he={hebrewDate.he} />
      </span>
      <div>
        <div className={styles.readingLabel}>
          <InterfaceText en="Torah" he="תורה" />
        </div>
        <div className={styles.refLink}>
          {book}
          <Link href={torah.href} data-target-module="library">
            <InterfaceText en={torah.en} he={torah.he} />
          </Link>
        </div>
        <div className={styles.aliyot}>
          {aliyot.map((a) => (
            <Link key={a.ref} className={styles.aliya} href={a.href} data-ref={a.ref} data-target-module="library">
              <InterfaceText en={a.en} he={a.he} />
            </Link>
          ))}
        </div>
      </div>
      <div>
        <div className={styles.readingLabel}>
          <InterfaceText en="Haftarah" he="הפטרה" />
        </div>
        <div className={styles.haftarot}>
          {haftarot.map((h) => (
            <div key={h.href} className={styles.refLink}>
              {book}
              <Link href={h.href} data-target-module="library">
                <InterfaceText en={h.en} he={h.he} />
              </Link>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export interface PortalModulesProps {
  about?: { title: MaybeBilingual; imageUri?: string; imageCaption?: MaybeBilingual; description?: MaybeBilingual };
  mobile?: { title: MaybeBilingual; description?: MaybeBilingual; androidLink?: string; iosLink?: string };
  organization?: { title: MaybeBilingual; description?: MaybeBilingual };
  newsletter?: { title: MaybeBilingual; description?: MaybeBilingual; form: ReactNode };
}

/**
 * PortalNavSideBar: a partner portal's modules in place of the side column — About (picture and text), the partner's app, the
 * organization and its newsletter — each only when the portal has it.
 *
 * @feature TOP-027 Portal topic pages
 */
export function PortalModules({ about, mobile, organization, newsletter }: PortalModulesProps) {
  return (
    <>
      {about ? (
        <SidebarModule title={<InterfaceText en={about.title.en} he={about.title.he} />}>
          {about.imageUri ? (
            <div className={styles.portalImage}>
              <TopicImage uri={about.imageUri} caption={about.imageCaption ?? {}} place="side" />
            </div>
          ) : null}
          <InterfaceMarkdown text={about.description} />
        </SidebarModule>
      ) : null}
      {mobile ? (
        <SidebarModule title={<InterfaceText en={mobile.title.en} he={mobile.title.he} />}>
          {mobile.description ? <InterfaceMarkdown text={mobile.description} /> : null}
          <a className={tm.store} href={mobile.iosLink} target="_blank" rel="noopener noreferrer">
            <img src="/icons/ios.svg" alt="Steinsaltz app on iOS" />
            <span>iOS</span>
          </a>
          <a className={tm.store} href={mobile.androidLink} target="_blank" rel="noopener noreferrer">
            <img src="/icons/android.svg" alt="Steinsaltz app on Android" />
            <span>Android</span>
          </a>
        </SidebarModule>
      ) : null}
      {organization ? (
        <SidebarModule title={<InterfaceText en={organization.title.en} he={organization.title.he} />}>
          {organization.description ? <InterfaceMarkdown text={organization.description} /> : null}
        </SidebarModule>
      ) : null}
      {newsletter ? (
        <SidebarModule title={<InterfaceText en={newsletter.title.en} he={newsletter.title.he} />}>
          <InterfaceMarkdown text={newsletter.description} />
          {newsletter.form}
        </SidebarModule>
      ) : null}
      <div className={nav.module} aria-hidden="true" />
    </>
  );
}
