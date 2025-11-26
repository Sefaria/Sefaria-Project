import React, { useEffect, useMemo, useState } from "react";
import { LanguageToggleButton } from "@static/js/Misc.jsx";
import { ReaderPanelContext } from "@static/js/context";

const meta = {
  title: "Misc/LanguageToggleButton",
  component: LanguageToggleButton,
  parameters: {
    layout: "fullscreen",
  },
  argTypes: {
    url: {
      control: "text",
      description: "Optional href for the toggle anchor",
    },
  },
};

export default meta;

const NAV_HEADER = {
  title: {
    en: "Browse the Library",
    he: "עיון בספריה",
  },
  dedication: {
    en: "Today's learning is sponsored by Rumelle L. Scott in honor of all her loved one's fall birthdays.",
    he: "הלמידה של היום מוקדשת על ידי רומל ל. סקוט לכבוד ימי ההולדת של יקיריה בעונת הסתיו.",
  },
};

const ADMIN_BUTTONS = [
  {
    id: "editTopicTop",
    classes: "top",
    label: {
      en: "Add sub-category",
      he: "הוסף קטגוריה",
    },
  },
  {
    id: "editTopicBottom",
    classes: "bottom",
    label: {
      en: "Reorder sources",
      he: "סדר מחדש את המקורות",
    },
  },
];

const NAV_CATEGORIES = [
  {
    slug: "Tanakh",
    color: "var(--tanakh-teal)",
    url: "/texts/Tanakh",
    title: {
      en: "Tanakh",
      he: 'תנ"ך',
    },
    description: {
      en: "Torah, Prophets, and Writings, which together make up the Hebrew Bible, Judaism's foundational text.",
      he: 'תורה, נביאים וכתובים - שלושת החלקים המרכיבים את התורה שבכתב, טקסט היסוד של היהדות.',
    },
  },
  {
    slug: "Mishnah",
    color: "var(--mishnah-blue)",
    url: "/texts/Mishnah",
    title: {
      en: "Mishnah",
      he: "משנה",
    },
    description: {
      en: "First major work of rabbinic literature, compiled around 200 CE, documenting a multiplicity of legal opinions in the oral tradition.",
      he: 'חיבור התשתית הקדום של חז"ל, המתעד מגוון דעות הלכתיות ממסורת התורה שבעל פה. נחתם בשנת 200 לספירה לערך.',
    },
  },
  {
    slug: "Talmud",
    color: "var(--talmud-gold)",
    url: "/texts/Talmud",
    title: {
      en: "Talmud",
      he: "תלמוד",
    },
    description: {
      en: "Generations of rabbinic debate about law, ethics, and Bible, structured as commentary on the Mishnah with stories interwoven.",
      he: 'דיוני חז"ל בנושאי הלכה, מוסר ותנ"ך שהתקיימו במשך דורות. בנויים כהרחבות על המשנה ושזורים בהם סיפורי אגדה.',
    },
  },
  {
    slug: "Midrash",
    color: "var(--midrash-green)",
    url: "/texts/Midrash",
    title: {
      en: "Midrash",
      he: "מדרש",
    },
    description: {
      en: "Interpretations and elaborations upon biblical texts, including stories, parables, and legal deductions.",
      he: 'פרשנויות והרחבות למקורות תנ"כיים הכוללות סיפורים, משלים ודיונים הלכתיים.',
    },
  },
  {
    slug: "Halakhah",
    color: "var(--halakhah-red)",
    url: "/texts/Halakhah",
    title: {
      en: "Halakhah",
      he: "הלכה",
    },
    description: {
      en: "Legal works providing guidance on all aspects of Jewish life. Rooted in past sources and growing to address changing realities.",
      he: "ספרות משפטית המדריכה את האדם בכל תחומי החיים. שורשיה במקורות העבר, והיא מתפתחת בהתאם למציאות החיים המשתנה.",
    },
  },
  {
    slug: "Kabbalah",
    color: "var(--kabbalah-purple)",
    url: "/texts/Kabbalah",
    title: {
      en: "Kabbalah",
      he: "קבלה",
    },
    description: {
      en: "Mystical works addressing topics like God's attributes and the relationship between God's eternality and the finite universe.",
      he: "ספרות מיסטית העוסקת בתכונות של האלוהות ובקשר בין אין-סופיותו של אלוהים ובין העולם הגשמי.",
    },
  },
  {
    slug: "Liturgy",
    color: "var(--liturgy-rose)",
    url: "/texts/Liturgy",
    title: {
      en: "Liturgy",
      he: "סדר התפילה",
    },
    description: {
      en: "Prayers, poems, and ritual texts, like Siddur and Haggadah, recited in daily worship or at specific occasions.",
      he: "קובצי מזמורים, פיוטים וטקסטים ריטואליים, כדוגמת הסידור וההגדה, הנאמרים יום-יום או באירועים מיוחדים.",
    },
  },
  {
    slug: "Jewish Thought",
    color: "var(--philosophy-purple)",
    url: "/texts/Jewish Thought",
    title: {
      en: "Jewish Thought",
      he: "מחשבת ישראל",
    },
    description: {
      en: "Jewish philosophy and theology, ranging from medieval to contemporary, analyzing topics like free will and chosenness.",
      he: "פילוסופיה ותאולוגיה מימי הביניים ועד ימינו, המעמיקה בסוגיות כגון בחירה חופשית והיותו של עם ישראל העם הנבחר.",
    },
  },
  {
    slug: "Tosefta",
    color: "var(--taanitic-green)",
    url: "/texts/Tosefta",
    title: {
      en: "Tosefta",
      he: "תוספתא",
    },
    description: {
      en: "Companion volumes to the Mishnah, containing laws and discussions that were not included in the Mishnah's redaction.",
      he: "ספרות תנאית מקבילה לסדרי המשנה, הכוללת הלכות ודיונים שלא הוכנסו למשנה.",
    },
  },
  {
    slug: "Chasidut",
    color: "var(--chasidut-green)",
    url: "/texts/Chasidut",
    title: {
      en: "Chasidut",
      he: "חסידות",
    },
    description: {
      en: "Spiritual revival movement founded in the 18th century, focusing on communion with God and divinity in the material world.",
      he: "תנועת התחדשות רוחנית שנוסדה במאה ה-18, העוסקת בדבקות באלוהים ובהתגלות האלוהית בתוך עולם החומר.",
    },
  },
  {
    slug: "Musar",
    color: "var(--mussar-purple)",
    url: "/texts/Musar",
    title: {
      en: "Musar",
      he: "ספרי מוסר",
    },
    description: {
      en: "Virtue-based instruction for moral and spiritual character development, ranging from medieval to contemporary.",
      he: "ספרות הדרכה להתפתחות אישית מוסרית ורוחנית החל מימי הביניים ועד ימינו.",
    },
  },
  {
    slug: "Responsa",
    color: "var(--responsa-red)",
    url: "/texts/Responsa",
    title: {
      en: "Responsa",
      he: 'שו"ת',
    },
    description: {
      en: "Answers and decisions written by rabbinic leaders in response to questions, demonstrating the application of Jewish law to actual cases.",
      he: "תשובות ופסיקות הלכה שנתנו רבנים בתגובה לשאלות שקיבלו, אשר מעידות על יישום ההלכה בחיי היום-יום.",
    },
  },
  {
    slug: "Second Temple",
    color: "var(--apocrypha-pink)",
    url: "/texts/Second Temple",
    title: {
      en: "Second Temple",
      he: "בית שני",
    },
    description: {
      en: "Works compiled around the time period of the Second Temple, which stood for several centuries and was destroyed in 70 CE.",
      he: "אוסף יצירות מתקופת בית המקדש השני, שעמד על תילו כמה מאות שנים עד שנחרב בשנת 70 לספירה.",
    },
  },
  {
    slug: "Reference",
    color: "var(--reference-orange)",
    url: "/texts/Reference",
    title: {
      en: "Reference",
      he: "מילונים וספרי יעץ",
    },
    description: {
      en: "Dictionaries, grammar works, and encyclopedias, from medieval to contemporary.",
      he: "מילונים, ספרי דקדוק ותחביר, ואנציקלופדיות מימי הביניים ועד ימינו.",
    },
  },
];

const HERO_SECTION = {
  heading: {
    en: "A Living Library of Torah",
    he: "ספריה יהודית דינמית",
  },
  body: {
    en: "Sefaria is home to 3,000 years of Jewish texts. We are a nonprofit organization offering free access to texts, translations, and commentaries so that everyone can participate in the ongoing process of studying, interpreting, and creating Torah.",
    he: "ספריא מאגדת 3,000 שנות טקסטים יהודיים. אנו עמותה ללא מטרות רווח המעניקה גישה חופשית לטקסטים, תרגומים ופרשנויות כך שכל אחד יוכל להשתתף בלימוד, בפירוש וביצירה של תורה.",
  },
  learnMore: {
    href: "/about",
    label: {
      en: "Learn More \u203a",
      he: "למדו עוד \u203a",
    },
  },
  videoLink: {
    href: "https://help.sefaria.org/hc/en-us/articles/21471911125020-Video-Guide-How-to-Get-Started-Navigating-the-Library",
    label: {
      en: "Getting Started (2 min)",
      he: "איך להתחיל (2 דק')",
    },
    alt: {
      en: "Play video",
      he: "נגן וידאו",
    },
  },
};

const RECENTLY_VIEWED = [
  { href: "/Exodus.7.8", label: { en: "Exodus 7:8", he: "שמות ז:ח" } },
  {
    href: "/Sifra%2C_Vayikra_Dibbura_DeNedavah%2C_Chapter_2.1",
    label: {
      en: "Sifra, Vayikra Dibbura DeNedavah, Chapter 2 1",
      he: "ספרה, ויקרא דיברתא דנדבה, פרק ב א",
    },
  },
  { href: "/Genesis.13.2", label: { en: "Genesis 13:2", he: "בראשית יג:ב" } },
];

const TRANSLATIONS_SECTION = {
  heading: {
    en: "Translations",
    he: "תרגומים",
  },
  description: {
    en: "Access key works from the library in several languages.",
    he: "גשו ליצירות המרכזיות בספריה במגוון שפות.",
  },
  languages: [
    { code: "ar", label: { en: "عربى", he: "عربى" } },
    { code: "de", label: { en: "Deutsch", he: "Deutsch" } },
    { code: "en", label: { en: "English", he: "English" } },
    { code: "eo", label: { en: "Esperanto", he: "Esperanto" } },
    { code: "es", label: { en: "Español", he: "Español" } },
    { code: "fa", label: { en: "فارسی", he: "فارسی" } },
    { code: "fi", label: { en: "suomen kieli", he: "suomen kieli" } },
    { code: "fr", label: { en: "Français", he: "Français" } },
    { code: "ro", label: { en: "română", he: "română" } },
    { code: "it", label: { en: "Italiano", he: "Italiano" } },
    { code: "pl", label: { en: "Polski", he: "Polski" } },
    { code: "pt", label: { en: "Português", he: "Português" } },
    { code: "ru", label: { en: "Pусский", he: "Pусский" } },
    { code: "yi", label: { en: "יידיש", he: "יידיש" } },
  ],
};

const LEARNING_SCHEDULES = {
  heading: {
    en: "Learning Schedules",
    he: "לוח לימוד יומי",
  },
  items: [
    {
      title: {
        en: "Weekly Torah Portion",
        he: "פרשת השבוע",
      },
      detail: {
        en: "Vayera",
        he: "וירא",
      },
      href: "/Genesis.18.1-22.24",
      reference: {
        en: "Genesis 18:1-22:24",
        he: "בראשית יח:א-כב:כד",
      },
    },
    {
      title: {
        en: "Haftarah",
        he: "הפטרה",
      },
      detail: {
        en: "",
        he: "",
      },
      href: "/II_Kings.4.1-23",
      reference: {
        en: "II Kings 4:1-23",
        he: "מלכים ב ד:א-כג",
      },
    },
    {
      title: {
        en: "Daf Yomi",
        he: "דף יומי",
      },
      detail: {
        en: "",
        he: "",
      },
      href: "/Zevachim.50",
      reference: {
        en: "Zevachim 50",
        he: "זבחים נ",
      },
    },
  ],
  footer: {
    href: "/calendars",
    label: {
      en: "All Learning Schedules \u203a",
      he: "לוחות לימוד נוספים \u203a",
    },
  },
};

const RESOURCES_SECTION = {
  heading: {
    en: "Resources",
    he: "עזרים",
  },
  links: [
    {
      href: "/mobile",
      icon: "/static/icons/mobile.svg",
      alt: {
        en: "Mobile Apps icon",
        he: "סמל יישומון טלפוני",
      },
      label: {
        en: "Mobile Apps",
        he: "יישומון לטלפון הנייד",
      },
    },
    {
      href: "/educators",
      icon: "/static/icons/educators.svg",
      alt: {
        en: "Teach with Sefaria icon",
        he: "סמל מלמדים עם ספריא",
      },
      label: {
        en: "Teach with Sefaria",
        he: "מלמדים עם ספריא",
      },
    },
    {
      href: "/visualizations",
      icon: "/static/icons/visualizations.svg",
      alt: {
        en: "Visualizations icon",
        he: "סמל תרשימים גרפיים",
      },
      label: {
        en: "Visualizations",
        he: "תרשימים גרפיים",
      },
    },
    {
      href: "/torah-tab",
      icon: "/static/icons/torah-tab.svg",
      alt: {
        en: "Torah Tab icon",
        he: "סמל תוסף תורה טאב",
      },
      label: {
        en: "Torah Tab",
        he: "תורה טאב (תוסף)",
      },
    },
    {
      href: "https://help.sefaria.org/hc/en-us",
      icon: "/static/icons/help.svg",
      alt: {
        en: "Help icon",
        he: "סמל עזרה",
      },
      label: {
        en: "Help",
        he: "עזרה",
      },
      target: "_blank",
    },
  ],
};

const FOOTER_LINKS = [
  {
    href: "http://localhost:8000/about",
    label: {
      en: "About",
      he: "אודות",
    },
  },
  {
    href: "http://localhost:8000/help",
    label: {
      en: "Help",
      he: "עזרה",
    },
  },
  {
    href: "mailto:hello@sefaria.org",
    label: {
      en: "Contact Us",
      he: "צור קשר",
    },
  },
  {
    href: "http://localhost:8000/newsletter",
    label: {
      en: "Newsletter",
      he: "ניוזלטר",
    },
  },
  {
    href: "https://blog.sefaria.org/",
    label: {
      en: "Blog",
      he: "בלוג",
    },
  },
  {
    href: "https://www.instagram.com/sefariaproject/",
    label: {
      en: "Instagram",
      he: "אינסטגרם",
    },
  },
  {
    href: "https://www.facebook.com/sefaria.org",
    label: {
      en: "Facebook",
      he: "פייסבוק",
    },
  },
  {
    href: "https://www.youtube.com/user/SefariaProject",
    label: {
      en: "YouTube",
      he: "יוטיוב",
    },
  },
  {
    href: "https://store.sefaria.org/",
    label: {
      en: "Shop",
      he: "חנות",
    },
  },
  {
    href: "http://localhost:8000/ways-to-give",
    label: {
      en: "Ways to Give",
      he: "דרכי תרומה",
    },
  },
  {
    href: "https://donate.sefaria.org/give/451346/#!/donation/checkout?c_src=Footer",
    label: {
      en: "Donate",
      he: "תרום",
    },
  },
];

const CATEGORY_ROWS = chunkList(NAV_CATEGORIES, 2);
const MOCK_TOC = NAV_CATEGORIES.map((category) => ({
  category: category.title.en,
  heCategory: category.title.he,
  slug: category.slug,
  contents: [],
}));

function chunkList(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

const getLangKey = (interfaceLang) => (interfaceLang === "hebrew" ? "he" : "en");
const getInterfaceClass = (interfaceLang) => (interfaceLang === "hebrew" ? "int-he" : "int-en");
const getContentSpanClass = (interfaceLang) => (interfaceLang === "hebrew" ? "he" : "en");
const pickText = (value, langKey) => (value?.[langKey] ?? value?.en ?? "");

const ReaderApp = ({ interfaceLang, children }) => {
  useEffect(() => {
    if (typeof globalThis !== "undefined") {
      globalThis.Sefaria = globalThis.Sefaria || {};
      globalThis.Sefaria.interfaceLang = interfaceLang;
      if (!globalThis.Sefaria.toc || globalThis.Sefaria.toc.length === 0) {
        globalThis.Sefaria.toc = MOCK_TOC;
      }
    }
  }, [interfaceLang]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return undefined;
    }
    const { body, documentElement } = document;
    const previousDir = documentElement.getAttribute("dir");
    body.classList.remove("english", "hebrew");
    body.classList.add(interfaceLang);
    documentElement.setAttribute("dir", interfaceLang === "hebrew" ? "rtl" : "ltr");
    return () => {
      body.classList.remove(interfaceLang);
      if (previousDir) {
        documentElement.setAttribute("dir", previousDir);
      } else {
        documentElement.removeAttribute("dir");
      }
    };
  }, [interfaceLang]);

  const contextValue = useMemo(() => ({ language: interfaceLang }), [interfaceLang]);

  const wrapperClassName = useMemo(
    () => `storybook-reader-app readerApp interface-${interfaceLang}`,
    [interfaceLang]
  );

  const wrapperStyle = useMemo(
    () => ({
      position: "relative",
      minHeight: "720px",
      backgroundColor: "#ffffff",
      overflow: "hidden",
    }),
    []
  );

  return (
    <ReaderPanelContext.Provider value={contextValue}>
      <div className={wrapperClassName} style={wrapperStyle}>
        <div className="singlePanel">
          <div className="readerPanelBox">{children}</div>
        </div>
      </div>
    </ReaderPanelContext.Provider>
  );
};

const useStoryInterfaceLang = (args, context) => {
  const { globals = {}, updateGlobals } = context ?? {};
  const [activeLang, setActiveLang] = useState(args.interfaceLang ?? globals.interfaceLang ?? "english");

  useEffect(() => {
    setActiveLang(args.interfaceLang ?? globals.interfaceLang ?? "english");
  }, [args.interfaceLang, globals.interfaceLang]);

  const setInterfaceLang = (nextLang) => {
    setActiveLang(nextLang);
    if (typeof updateGlobals === "function") {
      updateGlobals({ interfaceLang: nextLang });
    }
  };

  const toggleInterfaceLang = () =>
    setActiveLang((previous) => {
      const next = previous === "hebrew" ? "english" : "hebrew";
      if (typeof updateGlobals === "function") {
        updateGlobals({ interfaceLang: next });
      }
      return next;
    });

  return { interfaceLang: activeLang, setInterfaceLang, toggleInterfaceLang };
};

const resolveInterfaceLang = (args, context) =>
  args.interfaceLang ?? context?.globals?.interfaceLang ?? "english";

const ReaderPanelLayout = ({ interfaceLang, navMenuContent, sidebarContent = null }) => {
  const dataAnlBatch = useMemo(
    () => JSON.stringify({ panel_number: 1, content_lang: interfaceLang }),
    [interfaceLang]
  );

  return (
    <div className={`readerPanel serif ${interfaceLang} segmented light`} role="region" id="panel-0" data-anl-batch={dataAnlBatch}>
      <div className="readerNavMenu noLangToggleInHebrew">
        <div className="content">
          <div className="sidebarLayout">
            <div className="contentInner">{navMenuContent}</div>
          </div>
        </div>
      </div>
      {sidebarContent}
    </div>
  );
};

const ReaderNavTopBar = ({ interfaceLang, onToggle, url }) => {
  const langKey = getLangKey(interfaceLang);
  const interfaceClass = getInterfaceClass(interfaceLang);
  return (
    <div className="navTitle tight sans-serif">
      <span className="headerWithAdminButtons">
        <span>
          <h1>
            <span className={interfaceClass}>{pickText(NAV_HEADER.title, langKey)}</span>
          </h1>
        </span>
        <span>
          <span className="adminButtons hiddenButtons">
            {ADMIN_BUTTONS.map((button) => (
              <div key={button.id} id={button.id} className={`button extraSmall topic ${button.classes}`} role="button">
                <span className={interfaceClass}>{pickText(button.label, langKey)}</span>
              </div>
            ))}
          </span>
        </span>
      </span>
      <LanguageToggleButton url={url} toggleLanguage={onToggle} />
    </div>
  );
};

const ReaderPanelDedication = ({ interfaceLang }) => {
  const langKey = getLangKey(interfaceLang);
  const interfaceClass = getInterfaceClass(interfaceLang);
  return (
    <div className="dedication">
      <span>
        <span className={interfaceClass}>
          <div className="reactMarkdown">{pickText(NAV_HEADER.dedication, langKey)}</div>
        </span>
      </span>
    </div>
  );
};

const ReaderNavCategories = ({ interfaceLang }) => {
  const langKey = getLangKey(interfaceLang);
  const spanClass = getContentSpanClass(interfaceLang);
  return (
    <div className="readerNavCategories">
      <div className="responsiveNBox">
        <div className="gridBox">
          {CATEGORY_ROWS.map((row, index) => (
            <div className="gridBoxRow" key={`category-row-${index}`} style={{ gap: 0, marginTop: 0 }}>
              {row.map((category) => (
                <div className="gridBoxItem" key={category.slug}>
                  <div className="navBlock withColorLine" style={{ borderColor: category.color }}>
                    <a href={category.url} className="navBlockTitle" data-cat={category.slug}>
                      <span className={`contentSpan ${spanClass}`} lang={langKey}>
                        {pickText(category.title, langKey)}
                      </span>
                    </a>
                    <div className="navBlockDescription">
                      <span className={`contentSpan ${spanClass}`} lang={langKey}>
                        {pickText(category.description, langKey)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const RecentlyViewedModule = ({ interfaceLang }) => {
  const langKey = getLangKey(interfaceLang);
  const interfaceClass = getInterfaceClass(interfaceLang);
  return (
    <div className="navSidebarModule sans-serif">
      <div className="recentlyViewed">
        <div id="header">
          <h1>
            <span className={interfaceClass}>{pickText({ en: "Recently Viewed", he: "נצפו לאחרונה" }, langKey)}</span>
          </h1>
          <div className="navSidebarLink serif recentlyViewed">
            <ul>
              {RECENTLY_VIEWED.map((item) => (
                <li key={item.href}>
                  <a href={item.href}>{pickText(item.label, langKey)}</a>
                </li>
              ))}
            </ul>
          </div>
          <a href="/history" id="history">
            <span className={interfaceClass}>{pickText({ en: "All history \u203a", he: "כל ההיסטוריה \u203a" }, langKey)}</span>
          </a>
        </div>
      </div>
    </div>
  );
};

const TranslationsModule = ({ interfaceLang }) => {
  const langKey = getLangKey(interfaceLang);
  const interfaceClass = getInterfaceClass(interfaceLang);
  return (
    <div className="navSidebarModule sans-serif">
      <h1>
        <span className={interfaceClass}>{pickText(TRANSLATIONS_SECTION.heading, langKey)}</span>
      </h1>
      <span className={interfaceClass}>{pickText(TRANSLATIONS_SECTION.description, langKey)}</span>
      <div className="navSidebarLink serif language">
        <ul>
          {TRANSLATIONS_SECTION.languages.map((language) => (
            <li key={language.code}>
              <a href={`/translations/${language.code}`}>{pickText(language.label, langKey)}</a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

const LearningSchedulesModule = ({ interfaceLang }) => {
  const langKey = getLangKey(interfaceLang);
  const interfaceClass = getInterfaceClass(interfaceLang);
  return (
    <div className="navSidebarModule sans-serif">
      <h1>
        <span className={interfaceClass}>{pickText(LEARNING_SCHEDULES.heading, langKey)}</span>
      </h1>
      {LEARNING_SCHEDULES.items.map((item) => (
        <div className="readingsSection" key={item.href}>
          <span className="readingsSectionTitle">
            <span className={interfaceClass}>{pickText(item.title, langKey)}</span>
            {item.detail?.en || item.detail?.he ? (
              <>
                : <span className={interfaceClass}>{pickText(item.detail, langKey)}</span>
              </>
            ) : null}
          </span>
          <div className="navSidebarLink ref serif">
            <img src="/static/icons/book.svg" className="navSidebarIcon" alt="book icon" />
            <a href={item.href}>
              <span className={interfaceClass}>{pickText(item.reference, langKey)}</span>
            </a>
          </div>
        </div>
      ))}
      <a href={LEARNING_SCHEDULES.footer.href} className="allLink">
        <span className={interfaceClass}>{pickText(LEARNING_SCHEDULES.footer.label, langKey)}</span>
      </a>
    </div>
  );
};

const ResourcesModule = ({ interfaceLang }) => {
  const langKey = getLangKey(interfaceLang);
  const interfaceClass = getInterfaceClass(interfaceLang);
  return (
    <div className="navSidebarModule sans-serif">
      <h3>
        <span className={interfaceClass}>{pickText(RESOURCES_SECTION.heading, langKey)}</span>
      </h3>
      <div className="linkList">
        {RESOURCES_SECTION.links.map((link) => (
          <div className="navSidebarLink gray" key={link.href}>
            <img src={link.icon} className="navSidebarIcon" alt={pickText(link.alt, langKey)} />
            <a href={link.href} target={link.target ?? "_self"} rel={link.target === "_blank" ? "noreferrer" : undefined}>
              <span className={interfaceClass}>{pickText(link.label, langKey)}</span>
            </a>
          </div>
        ))}
      </div>
    </div>
  );
};

const SidebarHeroModule = ({ interfaceLang }) => {
  const langKey = getLangKey(interfaceLang);
  const interfaceClass = getInterfaceClass(interfaceLang);
  return (
    <div className="navSidebarModule sans-serif">
      <h1>
        <span className={interfaceClass}>{pickText(HERO_SECTION.heading, langKey)}</span>
      </h1>
      <span className={interfaceClass}>{pickText(HERO_SECTION.body, langKey)}</span>
      <a href={HERO_SECTION.learnMore.href} className="inTextLink">
        <span className={interfaceClass}>{pickText(HERO_SECTION.learnMore.label, langKey)}</span>
      </a>
      <span className={interfaceClass}>
        <a className="button get-start" href={HERO_SECTION.videoLink.href} data-target-module="voices">
          <img src="/static/icons/vector.svg" alt={pickText(HERO_SECTION.videoLink.alt, langKey)} />
          <div className="get-start">{pickText(HERO_SECTION.videoLink.label, langKey)}</div>
        </a>
      </span>
    </div>
  );
};

const SidebarFooter = ({ interfaceLang }) => {
  const langKey = getLangKey(interfaceLang);
  const interfaceClass = getInterfaceClass(interfaceLang);
  return (
    <div className="stickySidebarFooter navSidebarModule">
      <h1></h1>
      <div className="footerContainer">
        {FOOTER_LINKS.map((link) => (
          <a href={link.href} key={link.href}>
            <span className={interfaceClass}>{pickText(link.label, langKey)}</span>
          </a>
        ))}
      </div>
    </div>
  );
};

const SidebarWrapper = ({ children }) => (
  <aside className="navSidebar sans-serif" role="complementary" aria-label="Sidebar navigation">
    {children}
  </aside>
);

const NavSidebar = ({ interfaceLang }) => (
  <SidebarWrapper>
    <SidebarHeroModule interfaceLang={interfaceLang} />
    <div className="navSidebarModule sans-serif"></div>
    <RecentlyViewedModule interfaceLang={interfaceLang} />
    <TranslationsModule interfaceLang={interfaceLang} />
    <LearningSchedulesModule interfaceLang={interfaceLang} />
    <ResourcesModule interfaceLang={interfaceLang} />
    <SidebarFooter interfaceLang={interfaceLang} />
  </SidebarWrapper>
);

const ReaderPanelChrome = ({ interfaceLang, onToggle, url }) => (
  <ReaderPanelLayout
    interfaceLang={interfaceLang}
    navMenuContent={
      <>
        <ReaderNavTopBar interfaceLang={interfaceLang} onToggle={onToggle} url={url} />
        <ReaderPanelDedication interfaceLang={interfaceLang} />
        <ReaderNavCategories interfaceLang={interfaceLang} />
      </>
    }
    sidebarContent={<NavSidebar interfaceLang={interfaceLang} />}
  />
);

export const TopNavigation = {
  render: (args, context) => {
    const { interfaceLang, toggleInterfaceLang } = useStoryInterfaceLang(args, context);
    return (
      <ReaderApp interfaceLang={interfaceLang}>
        <ReaderPanelLayout
          interfaceLang={interfaceLang}
          navMenuContent={<ReaderNavTopBar interfaceLang={interfaceLang} onToggle={toggleInterfaceLang} url={args.url} />}
        />
      </ReaderApp>
    );
  },
  args: {
    url: "#toggle-language",
  },
};

export const Dedication = {
  render: (args, context) => {
    const interfaceLang = resolveInterfaceLang(args, context);
    return (
      <ReaderApp interfaceLang={interfaceLang}>
        <ReaderPanelLayout interfaceLang={interfaceLang} navMenuContent={<ReaderPanelDedication interfaceLang={interfaceLang} />} />
      </ReaderApp>
    );
  },
};

export const ReaderNavCategoriesGrid = {
  render: (args, context) => {
    const interfaceLang = resolveInterfaceLang(args, context);
    return (
      <ReaderApp interfaceLang={interfaceLang}>
        <ReaderPanelLayout interfaceLang={interfaceLang} navMenuContent={<ReaderNavCategories interfaceLang={interfaceLang} />} />
      </ReaderApp>
    );
  },
};

const renderSidebarStory = (interfaceLang, content) => (
  <ReaderApp interfaceLang={interfaceLang}>
    <ReaderPanelLayout
      interfaceLang={interfaceLang}
      navMenuContent={null}
      sidebarContent={<SidebarWrapper>{content}</SidebarWrapper>}
    />
  </ReaderApp>
);

export const NavSidebarHero = {
  render: (args, context) => {
    const interfaceLang = resolveInterfaceLang(args, context);
    return renderSidebarStory(interfaceLang, <SidebarHeroModule interfaceLang={interfaceLang} />);
  },
};

export const NavSidebarRecentlyViewed = {
  render: (args, context) => {
    const interfaceLang = resolveInterfaceLang(args, context);
    return renderSidebarStory(interfaceLang, <RecentlyViewedModule interfaceLang={interfaceLang} />);
  },
};

export const NavSidebarTranslations = {
  render: (args, context) => {
    const interfaceLang = resolveInterfaceLang(args, context);
    return renderSidebarStory(interfaceLang, <TranslationsModule interfaceLang={interfaceLang} />);
  },
};

export const NavSidebarLearningSchedules = {
  render: (args, context) => {
    const interfaceLang = resolveInterfaceLang(args, context);
    return renderSidebarStory(interfaceLang, <LearningSchedulesModule interfaceLang={interfaceLang} />);
  },
};

export const NavSidebarResources = {
  render: (args, context) => {
    const interfaceLang = resolveInterfaceLang(args, context);
    return renderSidebarStory(interfaceLang, <ResourcesModule interfaceLang={interfaceLang} />);
  },
};

export const NavSidebarFooterOnly = {
  render: (args, context) => {
    const interfaceLang = resolveInterfaceLang(args, context);
    return renderSidebarStory(interfaceLang, <SidebarFooter interfaceLang={interfaceLang} />);
  },
};
