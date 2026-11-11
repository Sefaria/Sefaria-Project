import { useLocation } from "@tanstack/react-router";
import { useCallback, type ReactNode } from "react";
import { uaEvent } from "~/lib/analytics";
import { SITE_ORIGIN } from "~/lib/config";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import { isValidEmailAddress, subscribeNewsletter } from "~/lib/user/newsletter";
import { NewsletterSignUp, type NewsletterSubscription } from "~/ui/NewsletterSignUp/NewsletterSignUp";

/**
 * /mobile, the Sefaria app's page: the old MobileAppPage (static/js/StaticPages.jsx), which Django's content block only mounts,
 * with the same markup and class names so static.css styles it as on sefaria.org. Its behaviour: the store buttons carry the visit's
 * UTM campaign to the App Store and Google Play (decided from the address on the server too, so the first paint has them), and the
 * newsletter sign-up at the bottom ("Subscribe from Mobile Landing Page").
 *
 * @feature STA-008 Product, tool and edition pages
 */
const DEFAULT_STORE_URLS = {
  ios: "https://apps.apple.com/app/apple-store/id1163273965?mt=8",
  android: "https://play.google.com/store/apps/details?id=org.sefaria.sefaria",
};

/** The old mobileAppStoreUrls: with utm_source, utm_medium and utm_campaign all present, the stores' own campaign parameters. */
export function mobileAppStoreUrls(search: string): { ios: string; android: string } {
  const params = new URLSearchParams(search);
  const source = params.get("utm_source");
  const medium = params.get("utm_medium");
  const campaign = params.get("utm_campaign");
  if (!source || !medium || !campaign) return DEFAULT_STORE_URLS;
  const referrer = new URLSearchParams({ utm_source: source, utm_medium: medium, utm_campaign: campaign });
  const androidParams = new URLSearchParams({ id: "org.sefaria.sefaria", referrer: referrer.toString() });
  const iosParams = new URLSearchParams({ pt: "118389482", ct: [source, medium, campaign].join("-"), mt: "8" });
  return { ios: `https://apps.apple.com/app/apple-store/id1163273965?${iosParams}`, android: `https://play.google.com/store/apps/details?${androidParams}` };
}

/** The old InterfaceText: one span, in the interface language (its class says which). */
function T({ en, he }: { en: string; he: string }) {
  const hebrew = useInterfaceLang() === "hebrew";
  return <span className={hebrew ? "int-he" : "int-en"}>{hebrew ? he : en}</span>;
}

const IMG = "/static/img/mobile-landing-page";
/** The page's images, on the site's origin (PUBLIC_SITE_ORIGIN, as the content's /static/ files: lib/static-page/sanitize.ts). */
const assetOrigin = () => SITE_ORIGIN.replace(/\/$/, "");

function DownloadButtons({ urls, className, dark }: { urls: { ios: string; android: string }; className: string; dark?: boolean }) {
  const cls = `${dark ? "mobileDownloadButton dark flexContainer" : "button flexContainer mobileDownloadButton"}`;
  const img = (name: string) => `${assetOrigin()}${IMG}/${name}`;
  return (
    <div className={className}>
      <a href={urls.ios} className={`${cls} int-en`} target="_blank" rel="noreferrer">
        <img src={img("apple.png")} alt="iOS" />
        <span>Download for iOS</span>
      </a>
      <a href={urls.android} className={`${cls} int-en`} target="_blank" rel="noreferrer">
        <img src={img("googleplay.png")} alt="Android" />
        <span>Download for Android</span>
      </a>
      <a href={urls.ios} className={`${cls} int-he`} target="_blank" rel="noreferrer">
        <img src={img("apple.png")} alt="iOS" />
        <span>הורדה ל iOS</span>
      </a>
      <a href={urls.android} className={`${cls} int-he`} target="_blank" rel="noreferrer">
        <img src={img("googleplay.png")} alt="Android" />
        <span>הורדה לאנדרואיד</span>
      </a>
    </div>
  );
}


function Testimonial({ icon, title, text, attrib }: { icon: string; title: { en: string; he: string }; text: { en: string; he: string }; attrib: { en: string; he: string } }) {
  return (
    <div className="mobileTestimonialItem">
      <div className="mobileTestimonialIconHolder">
        <img src={`${assetOrigin()}${IMG}/${icon}`} className="mobileTestimonialIcon" alt="" />
      </div>
      <h3 className="mobileTestimonialHeader">
        <span className="int-en">{title.en}</span>
        <span className="int-he">{title.he}</span>
      </h3>
      <div className="mobileTestimonialContent">
        <p className="mobileTestimonialText">
          <span className="int-en">{text.en}</span>
          <span className="int-he">{text.he}</span>
        </p>
        <span className="mobileTestimonialAttribution">
          <span className="int-en">{attrib.en}</span>
          <span className="int-he">{attrib.he}</span>
        </span>
      </div>
    </div>
  );
}

function Feature(p: { reverse?: boolean; title: { en: string; he: string }; text: { en: string; he: string }; img: { en: string; he: string }; alt: { en: string; he: string }; borderColor: string }) {
  return (
    <div className="feature">
      <div className={`staticPageBlockInner flexContainer${p.reverse ? " flexReverse" : ""}`}>
        <div className="featureText" style={{ borderColor: p.borderColor }}>
          <div className="featureHeader">
            <h3>
              <span className="int-en">{p.title.en}</span>
              <span className="int-he">{p.title.he}</span>
            </h3>
          </div>
          <div className="int-en">{p.text.en}</div>
          <div className="int-he">{p.text.he}</div>
        </div>
        <div className="featureImage">
          <img className="int-en" src={`${assetOrigin()}${IMG}/${p.img.en}`} alt={p.alt.en} />
          <img className="int-he" src={`${assetOrigin()}${IMG}/${p.img.he}`} alt={p.alt.he} />
        </div>
      </div>
    </div>
  );
}

const ABOUT_STYLE = { fontSize: "18px", lineHeight: "1.7", margin: "50px 0" } as const;

/** The old palette.colors (static/js/sefaria/palette.js) the page's features are bordered with. */
const COLORS = { yellow: "#ccb479", blue: "#4871bf", green: "#5d956f", red: "#802f3e" };

export function MobileAppPage(): ReactNode {
  const urls = mobileAppStoreUrls(useLocation().searchStr ?? "");
  const lang = useInterfaceLang();
  const subscribe = useCallback((s: NewsletterSubscription) => subscribeNewsletter({ ...s, interfaceLang: lang }), [lang]);
  return (
    <div id="MobilePageOuter" className="staticPageFrame">
      <div id="MobilePageInner" className="staticPageInner">
        <div className="staticPage mobile">
          <div className="staticPageHeader mobile">
            <div className="staticPageBlockInner flexContainer">
              <div className="staticPageHeaderTextBox">
                <h1>
                  <span className="int-en">The Sefaria Library App</span>
                  <span className="int-he">יישומון ספריית ספריא</span>
                </h1>
                <div className="staticPageHeaderText mobile">
                  <T en="The Jewish Library — Free, Anywhere, Anytime." he="ספרייה של כל מקורות היהדות זמינה בכל עת ובכל מקום." />
                </div>
                <DownloadButtons urls={urls} className="mobileHeaderButtons" />
              </div>
              <div className="staticPageHeaderImg">
                <div className="mobileHeaderImages">
                  <img className="mobileHeaderPhone int-en" src={`${assetOrigin()}${IMG}/headerphone.png`} alt="Sefaria app on phone" />
                  <img className="mobileHeaderPhone int-he" src={`${assetOrigin()}${IMG}/headerphoneHEB.png`} alt="Sefaria app on phone" />
                  <img className="mobileHeaderTablet int-en" src={`${assetOrigin()}${IMG}/tablet.png`} alt="Sefaria app on tablet" />
                  <img className="mobileHeaderTablet int-he" src={`${assetOrigin()}${IMG}/tabletHEB.png`} alt="Sefaria app on tablet" />
                </div>
              </div>
            </div>
          </div>
          <div className="int-en staticPageBlockInner">
            <p className="staticPageAboutText" style={ABOUT_STYLE}>
              Explore Sefaria&#39;s free library of Jewish texts in original langauges and translation: Torah, Talmud, Mishnah, Kabbalah, siddur, and more. Discover 3,000 years of texts with links,
              interconnections, and commentaries. Download nearly the entire library to learn offline &#x2014; anywhere, anytime.
            </p>
          </div>
          <div className="int-he staticPageBlockInner">
            <p className="staticPageAboutText" style={ABOUT_STYLE}>
              היישומון מאפשר גישה חופשית למאגר נרחב של כותרים בשפות המקור ובמגוון תרגומים. ספריית ספריא כוללת מקורות בקטגוריות שונות: תנ&quot;ך, תלמוד, משנה, קבלה, תפילה ועוד. יישומון ספריית ספריא
              מאפשר לכם להעמיק במקורות ללא גבולות זמן ומקום. המקורות כולם מקושרים ביניהם ובכך הלמידה רחבה יותר ועשירה. בנוסף, ניתן להוריד את מרבית הכותרים למכשיר האישי על מנת ללמוד בכל מקום - גם
              ללא חיבור לאינטרנט.
            </p>
          </div>
          <div className="colorLine" />
          <div className="greyBackground">
            <div className="staticPageBlockInner mobileTestimonialsSection">
              <Testimonial
                icon="siddur.png"
                title={{ en: "Always have a siddur in your pocket", he: "עם סידור בכיס, אפשר להתפלל בכל מקום" }}
                text={{
                  en: `"I can look up anything in an easy format. You never know when you might need to find a prayer or a passage, and it's all sitting there on my phone."`,
                  he: `״אני תמיד יכולה לחפש מקורות או תפילות, וכולם נגישים בפורמט נוח. אף פעם אני לא יכולה לדעת מתי אצטרך לחפש תפילה או כמה פסוקים על הדרך – ועכשיו הכל נמצא אצלי בטלפון״`,
                }}
                attrib={{ en: "Jessica L, User", he: "ג׳סיקה ל., משתמשת בספריא" }}
              />
              <Testimonial
                icon="educate.png"
                title={{ en: "Look up education resources on the go", he: "חיפוש מהיר של מקורות, בכל זמן" }}
                text={{
                  en: `"I use Sefaria all the time - prepping for class, learning on the go, in the middle of a conversation and want to find a source. It has been an amazing tool in my life."`,
                  he: `"אני משתמשת ביישומון של ספריא כל הזמן - בין אם אני מתכננת שיעור, לומדת על הדרך, או פתאום צריכה מקור באמצע שיחה. זה כלי מדהים שממש מעשיר את החיים שלי."`,
                }}
                attrib={{ en: "Jaclyn S, Educator", he: "ג׳קלין ס., מחנכת" }}
              />
              <Testimonial
                icon="commute.png"
                title={{ en: "Learn on your commute", he: "ללמוד בדרך לעבודה או ללימודים? אין בעיה!" }}
                text={{
                  en: `"I am constantly on the app during my NYC subway commute, whether I'm reviewing texts for class, reading the day's 929 chapter, or studying parshat hashavua."`,
                  he: `״אני כל הזמן פותחת את היישומון של ספריא בזמן שאני נוסעת ברכבת התחתית בניו יורק. לפעמים אני עוברת על מקורות לפני השיעור הבא, לפעמים אני קוראת את הפרק היומי ב-929 ולפעמים אני לומדת את פרשת השבוע.״`,
                }}
                attrib={{ en: "Vanessa H, Rabbinical Student", he: "וונסה ה, סטודנטית לרבנות" }}
              />
            </div>
          </div>
          <div className="mobileFeatures">
            <Feature
              title={{ en: "Calendar", he: "לוח לימוד יומי" }}
              text={{
                en: "Check the daily calendar to find current readings for the weekly Torah portion, Daf Yomi, 929, and a dozen other communal learning schedules.",
                he: "בעזרת לוח הלימוד היומי של ספריית ספריא תוכלו למצוא את הקריאות הרלוונטיות בתורה, את הדף היומי בתלמוד, את 929 ועוד.",
              }}
              img={{ en: "calmock.png", he: "calmockHEB.png" }}
              alt={{ en: "Screenshot of calendar on app", he: "Screenshot of calendar on app" }}
              borderColor={COLORS.yellow}
            />
            <Feature
              reverse
              title={{ en: "Commentaries", he: "פרשנויות, מדרשים ועוד" }}
              text={{
                en: "Learn with a variety of commentaries and explore the interconnections between texts. Torah commentaries include Rashi, Ibn Ezra, Ramban, Sforno, Abarbanel, and more. Talmud commentaries include Rashi, Tosafot, Rashba, Rosh, and more.",
                he: `בספריית ספריא תוכלו לעיין במקוון פרשנויות, מדרשים ועוד, וליהנות מקישוריות המחברת בין המקורות שמצטטים זה את זה או שיש ביניהם קשר תמטי. אלה כוללים את כתביהם של רש"י, אבן עזרא, רמב"ן, ספורנו, אברבנאל ועוד אודות התנ"ך, ואת פירושי רש"י , רשב"א ועוד רבים אחרים על התלמוד.`,
              }}
              img={{ en: "commmock.png", he: "commmockHEB.png" }}
              alt={{ en: "Screenshot of commentary panel on app", he: "Screenshot of commentary panel on app" }}
              borderColor={COLORS.blue}
            />
            <Feature
              title={{ en: "Search", he: "חיפוש מקיף בכמה לחיצות מהירות" }}
              text={{
                en: "Use the search tool to find topics, words, and phrases in both Hebrew and English. Filter your search by book, category, or relevance.",
                he: "בעזרת שורת החיפוש, תוכלו לחפש נושאי, מילות מפתח ופיסקאות בעברית ובאנגלית. ניתן אף לצמצם את תוצאות החיפוש באמצעות סינון ומיון כגון כרונולוגיה של המקורות או השתייכות לכותר מסוים.",
              }}
              img={{ en: "searchmock.png", he: "searchmockHEB.png" }}
              alt={{ en: "Screenshot of search on app", he: "Screenshot of search on app" }}
              borderColor={COLORS.green}
            />
            <Feature
              reverse
              title={{ en: "Account Features", he: "מאפיינים אישיים לבעלי חשבון אישי" }}
              text={{
                en: "Log in with a free Sefaria account to bookmark texts, sync your reading history across devices, and customize your settings.",
                he: "התחברו לחשבון האישי שלכם בספריא על מנת לשמור מקורות ברשימת המועדפים, לסנכרן את היסטוריית הקריאה שלכם במספר מכשירים במקביל ולעדכן את הגדרות הפרופיל שלכם.",
              }}
              img={{ en: "accountfeaturesmock.png", he: "accountfeaturesmockHEB.png" }}
              alt={{ en: "Screenshot of settigns on app", he: "Screenshot of settings on app" }}
              borderColor={COLORS.red}
            />
          </div>
          <div className="mobileDownloadCTA staticPageBlockInner">
            <h3>
              <span className="int-en">Download the app and start exploring today</span>
              <span className="int-he">למה אתם מחכים? הורידו היום את היישומון של ספריית ספריא והתחילו במסע למידה מעמיק ומעשיר.</span>
            </h3>
            <DownloadButtons urls={urls} className="mobileDownloadCtaButtons" dark />
          </div>
          <div className="staticPageCallToActionFooter">
            <div className="staticPageBlockInner flexContainer">
              <div className="callToActionText">
                <T en="Receive the latest updates" he="הירשמו לקבלת עדכונים" />
              </div>
              <NewsletterSignUp
                subscribe={subscribe}
                isValidEmail={isValidEmailAddress}
                includeEducatorOption={false}
                onSubscribed={() => uaEvent("Newsletter", "Subscribe from Mobile Landing Page", "")}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
