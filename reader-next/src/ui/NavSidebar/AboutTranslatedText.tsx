import { InterfaceText } from "../InterfaceText/InterfaceText";
import { LangText } from "../LangText/LangText";
import { SidebarModule } from "./NavSidebar";
import styles from "./NavSidebar.module.css";

export interface AboutTranslatedTextProps {
  /** The blurb in the page's language; absent (English, Hebrew) shows the library's own blurb in the interface language. */
  about?: { title: string; body: string };
  /** BCP-47 code of the blurb's language and its direction. */
  lang: string;
  dir: "ltr" | "rtl";
}

/**
 * A translations page's About module (the old AboutTranslatedText): "A Living Library of Torah" written in the page's language — its
 * title in the interface's font, its text bare in the module's sans font in either interface — or, for English and Hebrew, the
 * library's own title and text in the interface language (without Learn More or the video, unlike the home page's About module).
 *
 * @feature LIB-029 Sidebar module: About translated text
 */
export function AboutTranslatedText({ about, lang, dir }: AboutTranslatedTextProps) {
  if (!about) {
    return (
      <SidebarModule title={<InterfaceText en="A Living Library of Torah" he="ספריה יהודית דינמית" />}>
        <InterfaceText
          en="Sefaria is home to 3,000 years of Jewish texts. We are a nonprofit organization offering free access to texts, translations, and commentaries so that everyone can participate in the ongoing process of studying, interpreting, and creating Torah."
          he="ספריא היא ביתם של 3,000 שנות ספרות יהודית. אנו ארגון ללא מטרות רווח המציע גישה חופשית למקורות יהודיים, לתרגומים ולפרשנויות, ומטרתנו לאפשר לכל אחד ואחת להשתתף בתהליך המתמשך של לימוד וחידוש בתורה."
        />
      </SidebarModule>
    );
  }
  return (
    <SidebarModule title={<LangText className={styles.bareTitle} lang={lang} dir={dir}>{about.title}</LangText>}>
      {/* a block in the module's font and direction (the old bare text node: its line box is Roboto's in either interface); the
          text inside keeps its own language and direction, so a sentence's final period stays at its end */}
      <div className={styles.bareText}><LangText lang={lang} dir={dir}>{about.body}</LangText></div>
    </SidebarModule>
  );
}
