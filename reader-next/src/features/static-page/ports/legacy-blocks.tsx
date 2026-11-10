import { useCallback, useLayoutEffect, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { uaEvent } from "~/lib/analytics";
import { SITE_ORIGIN } from "~/lib/config";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import { isValidEmailAddress, subscribeNewsletter } from "~/lib/user/newsletter";
import { NewsletterSignUp, type NewsletterSubscription } from "~/ui/NewsletterSignUp/NewsletterSignUp";

/**
 * The old static pages' building blocks (static/js/StaticPages.jsx, Misc.jsx), with the same markup and class names, so the ported
 * pages (T-F32) are styled by the scoped legacy static.css exactly as on sefaria.org. Strings given as HTML are the pages' own literals
 * (never data from elsewhere).
 */

/** A /static/ image on the site's origin (PUBLIC_SITE_ORIGIN, as the content's own files). */
export const asset = (path: string) => (path.startsWith("/static/") ? `${SITE_ORIGIN.replace(/\/$/, "")}${path}` : path);

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

/** The old InterfaceText: one span in the interface language; with no text in it, the other language's (enInHe / heInEn). */
export function InterfaceSpan({ en, he }: { en: string; he: string }) {
  const hebrew = useInterfaceLang() === "hebrew";
  const text = hebrew ? he || en : en || he;
  const fallback = hebrew && !he ? " enInHe" : !hebrew && !en ? " heInEn" : "";
  return <span className={`${hebrew ? "int-he" : "int-en"}${fallback}`}>{text}</span>;
}

export const SimpleInterfaceBlock = ({ en, he, classes }: { en: string; he: string; classes?: string }) => (
  <div className={classes}>
    <InterfaceSpan en={en} he={he} />
  </div>
);

/** Both languages' spans (the page's CSS hides the other one). */
export const Both = ({ en, he }: { en: ReactNode; he: ReactNode }) => (
  <>
    <span className="int-en">{en}</span>
    <span className="int-he">{he}</span>
  </>
);
const Html = ({ className, html }: { className: string; html: string }) => <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;

export const StaticPageBody = ({ children, optionalClass }: { children: ReactNode; optionalClass?: string }) => <div className={cx("staticPage", optionalClass)}>{children}</div>;
export const Spacer = ({ height }: { height?: number }) => <div className="staticPageSpacer" style={{ height: height || 60 }} />;
export const HeBlock = ({ children, padded }: { children: ReactNode; padded?: boolean }) => <div className={cx("int-he", padded && "staticPageBlockInner")}>{children}</div>;
export const EnBlock = ({ children, padded }: { children: ReactNode; padded?: boolean }) => <div className={cx("int-en", padded && "staticPageBlockInner")}>{children}</div>;
export const GreyBox = ({ children, light }: { children: ReactNode; light?: boolean }) => <div className={light ? "lightgreyBackground" : "greyBackground"}>{children}</div>;

export const H1Block = ({ en, he }: { en: string; he: string; serif?: boolean }) => (
  <div className="staticPageBlockInner">
    <h1 className="staticPageH1 serif">
      <SimpleInterfaceBlock en={en} he={he} />
    </h1>
  </div>
);
export const H2Block = ({ en, he }: { en: string; he: string }) => (
  <div className="staticPageBlockInner">
    <h2 className="staticPageH2">
      <SimpleInterfaceBlock en={en} he={he} />
    </h2>
  </div>
);
export const Section = ({ children }: { children: ReactNode }) => <div className="staticPageBlockInner staticPageSection">{children}</div>;

export const Accordian = ({ enTitle, heTitle, enText, heText, colorBar }: { enTitle: string; heTitle: string; enText: string; heText: string; colorBar: string }) => (
  <details style={{ borderColor: colorBar }}>
    <summary>
      <Both en={enTitle} he={heTitle} />
    </summary>
    <Html className="int-en" html={enText} />
    <Html className="int-he" html={heText} />
  </details>
);

export const HeaderWithColorAccentBlockAndText = ({ enTitle, heTitle, enText, heText, colorBar }: { enTitle: string; heTitle: string; enText: string; heText: string; colorBar: string }) => (
  <div className="HeaderWithColorAccentBlockAndText">
    <h2 className="serif">
      <Both en={enTitle} he={heTitle} />
    </h2>
    <hr style={{ borderColor: colorBar }} />
    <Html className="int-en" html={enText} />
    <Html className="int-he" html={heText} />
  </div>
);

export const SimpleButton = ({ href, he_href, he, en, white, rounded = true, tall = false, newTab = false }: { href: string; he_href?: string; he: string; en: string; white?: boolean; rounded?: boolean; tall?: boolean; newTab?: boolean }) => (
  <div className="simpleButtonWrapper">
    <a href={href} className={cx("button", "flexContainer", "int-en", white && "white", tall && "tall", rounded && "rounded")} target={newTab ? "_blank" : "_self"} rel="noreferrer">
      <span className="int-en">{en}</span>
    </a>
    <a href={he_href || href} className={cx("button", "flexContainer", "int-he", white && "white", tall && "tall", rounded && "rounded")}>
      <span className="int-he">{he}</span>
    </a>
  </div>
);

export const ButtonRow = ({ children, white, light }: { children: ReactNode; white?: boolean; light?: boolean }) => (
  <div className={cx("buttonRow", "blockVerticalPadding", light && "lightgreyBackground", !white && !light && "greyBackground")}>
    <div className="staticPageBlockInner flexContainer">{children}</div>
  </div>
);

export const Feature = (p: { enTitle: string; heTitle: string; enText: string; heText: string; enImg: string; heImg: string; enImgAlt: string; heImgAlt: string; borderColor?: string }) => (
  <div className="feature">
    <div className="staticPageBlockInner flexContainer">
      <div className="featureText" style={p.borderColor ? { borderColor: p.borderColor } : undefined}>
        <div className="featureHeader">
          <h3>
            <Both en={p.enTitle} he={p.heTitle} />
          </h3>
        </div>
        <Html className="int-en" html={p.enText} />
        <Html className="int-he" html={p.heText} />
      </div>
      <div className="featureImage">
        <img className="int-en" src={p.enImg ? asset(p.enImg) : undefined} alt={p.enImgAlt} />
        <img className="int-he" src={p.heImg ? asset(p.heImg) : undefined} alt={p.heImgAlt} />
      </div>
    </div>
  </div>
);

export const FeatureBox = (p: { enTitle: string; heTitle: string; enText: string; heText: string; enButtonText: string; heButtonText: string; enButtonUrl: string; heButtonUrl: string; borderColor: string }) => (
  <div className="featureBox" style={{ borderColor: p.borderColor }}>
    <div className="featureHeader">
      <h3>
        <Both en={p.enTitle} he={p.heTitle} />
      </h3>
    </div>
    <Html className="int-en" html={p.enText} />
    <Html className="int-he" html={p.heText} />
    <SimpleButton white={false} rounded tall={false} href={p.enButtonUrl} he_href={p.heButtonUrl} he={p.heButtonText} en={p.enButtonText} />
  </div>
);

export const UserQuote = ({ enText, heText, image, enName, heName }: { enText: string; heText: string; image: string; enName: string; heName: string }) => (
  <div className="staticPageUserQuote">
    <div className="staticPageUserQuoteContent">
      <Html className="int-en" html={enText} />
      <Html className="int-he" html={heText} />
    </div>
    <div className="staticPageUserQuoteNameBox">
      <img src={asset(image)} />
      <div className="staticPageUserQuoteName">
        <span className="int-en" dangerouslySetInnerHTML={{ __html: enName }} />
        <span className="int-he" dangerouslySetInnerHTML={{ __html: heName }} />
      </div>
    </div>
  </div>
);

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * The old ResponsiveNBox: the items in rows of 1, 2 or 3 by the box's own width (2 above threshold2, 3 above threshold3), the last
 * row padded with placeholders unless `stretch`. The server and the first render assume 1000px (as the old server render did); the
 * box is measured before the browser paints.
 */
export function ResponsiveNBox({ content, stretch, threshold2 = 500, threshold3 = 1500, gap = 0 }: { content: ReactNode[]; stretch?: boolean; threshold2?: number; threshold3?: number; gap?: number | string }) {
  const [width, setWidth] = useState(1000);
  const ref = useRef<HTMLDivElement>(null);
  useIsoLayoutEffect(() => {
    // never wider than the window: the old box started at the window's width, so wide rows never widened the box they were measured by
    const measure = () => setWidth(Math.min(ref.current ? ref.current.offsetWidth : 1000, window.innerWidth));
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  const n = width > threshold3 ? 3 : width > threshold2 ? 2 : 1;
  const rows: ReactNode[][] = [];
  for (let i = 0; i < content.length; i += n) rows.push(content.slice(i, i + n));
  const rowStyle: CSSProperties = { gap, marginTop: gap };
  return (
    <div className="responsiveNBox" ref={ref}>
      <div className="gridBox">
        {rows.map((row, i) => {
          const cells = stretch ? row : [...row, ...Array<ReactNode>(n - row.length).fill("")];
          return (
            <div className="gridBoxRow" key={i} style={rowStyle}>
              {cells.map((item, j) => (
                <div className={cx("gridBoxItem", !item && "placeholder")} key={`gridItem|${j}`}>
                  {item}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** The old NewsletterSignUpForm (contextName for its event "Subscribe from <context>"), as this client's NewsletterSignUp. */
export function PageNewsletter({ contextName, includeEducatorOption = true }: { contextName: string; includeEducatorOption?: boolean }) {
  const lang = useInterfaceLang();
  const subscribe = useCallback((s: NewsletterSubscription) => subscribeNewsletter({ ...s, interfaceLang: lang }), [lang]);
  return <NewsletterSignUp subscribe={subscribe} isValidEmail={isValidEmailAddress} includeEducatorOption={includeEducatorOption} onSubscribed={() => uaEvent("Newsletter", `Subscribe from ${contextName}`, "")} />;
}

/** The frame Django's content block mounts the old component in (`<div id="XOuter" class="staticPageFrame"><div id="XInner" …>`). */
export const Mount = ({ name, children }: { name: string; children: ReactNode }) => (
  <div id={`${name}Outer`} className="staticPageFrame">
    <div id={`${name}Inner`} className="staticPageInner">
      {children}
    </div>
  </div>
);
