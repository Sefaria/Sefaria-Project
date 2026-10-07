import { VOICES } from "~/lib/shell/links";
import type { ReactNode } from "react";
import { isCategory, type TocBook, type TocNode } from "~/lib/catalog/toc";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import { categoryAttribution } from "~/lib/book/book-page";
import { descriptionPlacement, hebrewContentSort, pageTitle, renderedTextTitle, subCategoryToggle, type Bilingual } from "~/lib/library/category-model";
import { refToUrl } from "~/lib/ref/url";
import { ContentLanguage } from "../ContentLanguage/ContentLanguage";
import { InterfaceText } from "../InterfaceText/InterfaceText";
import { Link } from "../Link/Link";
import { NavPage } from "../NavPage/NavPage";
import { categoryColor } from "../tokens/category-color";
import styles from "./CategoryPage.module.css";

export interface CategoryPageProps {
  /** The page's path, Talmud / Tosefta already given their default corpus. */
  cats: readonly string[];
  /** What the category lists. */
  contents: readonly TocNode[];
  he: (category: string) => string;
  /** Hebrew content language: contents are sorted the Hebrew way. */
  hebrewContent?: boolean;
  sidebar?: ReactNode;
  footer?: ReactNode;
}

const catHref = (path: readonly string[]) => `/texts/${path.map(encodeURIComponent).join("/")}`;
const lang = (he: boolean) => (he ? "he" : "en");
const pick = (b: Bilingual, he: boolean) => (he ? b.he || b.en : b.en);

/**
 * A category's page: its title (with the Bavli / Yerushalmi toggle for Talmud), the texts and sub-categories in it — each a
 * link with its short description — and nested sections that open inline. A port of the old TextCategoryPage.
 *
 * @feature LIB-008 Category page contents list
 * @feature LIB-009 Talmud and Tosefta default sub-corpus
 * @feature LIB-010 Commentary category titling
 * @feature LIB-011 Talmud and Tosefta edition toggle
 * @feature LIB-012 Nested category sections and single-text collapse
 * @feature LIB-014 Text items open book page
 * @feature LIB-015 Short title rendering in category lists
 * @feature LIB-016 Hebrew ordering of category contents
 */
export function CategoryPage({ cats, contents, he, hebrewContent, sidebar, footer }: CategoryPageProps) {
  return (
    <NavPage colorCategory={cats[0]} sidebar={sidebar} footer={footer}>
      <ContentLanguage>
        <CategoryMain cats={cats} contents={contents} he={he} hebrewContent={hebrewContent} />
      </ContentLanguage>
    </NavPage>
  );
}

function CategoryMain({ cats, contents, he, hebrewContent }: Pick<CategoryPageProps, "cats" | "contents" | "he" | "hebrewContent">) {
  const hebrewUi = useInterfaceLang() === "hebrew";
  const category = cats.at(-1)!;
  const title = pageTitle(cats, category, he);
  const toggle = subCategoryToggle(cats);
  const edition = categoryAttribution(cats);
  return (
    <>
      <div className={styles.titleBar}>
        <h1 className={styles.title} lang={lang(hebrewUi)}>{pick(title, hebrewUi)}</h1>
        {toggle ? (
          <div className={styles.toggles}>
            {toggle.map((t) => (
              <Link key={t.sub} className={styles.toggle} href={catHref(t.path)} aria-current={t.active ? "page" : undefined} data-current={t.active || undefined}>
                <InterfaceText en={t.label.en} he={t.label.he} />
              </Link>
            ))}
          </div>
        ) : null}
      </div>
      {edition ? <div className={styles.attribution}><Link href={edition.href}><InterfaceText en={edition.en} he={edition.he} /></Link></div> : null}
      <Contents contents={contents} cats={cats} category={category} nest={category === "Commentary" ? 1 : 0} he={he} hebrewContent={!!hebrewContent || hebrewUi} hebrewUi={hebrewUi} />
    </>
  );
}

function Block({ href, title, desc, line, hebrewUi }: { href: string; title: Bilingual; desc?: Bilingual; line?: string; hebrewUi: boolean }) {
  return (
    <div className={styles.block} data-line={line ? "" : undefined} style={line ? ({ ["--_line" as string]: line } as React.CSSProperties) : undefined}>
      <Link className={styles.blockTitle} href={href} lang={lang(hebrewUi)}>{pick(title, hebrewUi)}</Link>
      {desc && (hebrewUi ? desc.he : desc.en) ? <div className={styles.desc} lang={lang(hebrewUi)}>{pick(desc, hebrewUi)}</div> : null}
    </div>
  );
}

function Contents({ contents, cats, category, nest, he, hebrewContent, hebrewUi }: { contents: readonly TocNode[]; cats: readonly string[]; category: string; nest: number; he: (c: string) => string; hebrewContent: boolean; hebrewUi: boolean }) {
  const items = hebrewContent ? hebrewContentSort(contents) : contents;
  const out: ReactNode[] = [];
  let run: ReactNode[] = [];
  const flush = () => {
    if (run.length) out.push(<div key={`run${out.length}`} className={styles.grid}>{run}</div>);
    run = [];
  };
  const textBlock = (b: TocBook, k: string) => {
    const t = renderedTextTitle(b.title, b.heTitle, cats, he);
    run.push(<Block key={k} href={`/${refToUrl(b.title)}`} title={t} desc={{ en: b.enShortDesc ?? "", he: b.heShortDesc ?? "" }} hebrewUi={hebrewUi} />);
  };
  for (const item of items) {
    if (isCategory(item)) {
      const newCats = [...cats, item.category];
      if (item.isPrimary || nest > 0) {
        const only = item.contents?.length === 1 && !isCategory(item.contents[0]!) ? (item.contents[0] as TocBook) : undefined;
        if (only) {
          if (only.hidden) continue;
          textBlock(only, `t.${only.title}`);
        } else {
          run.push(<Block key={`c.${item.category}`} href={catHref(newCats)} title={{ en: item.category, he: item.heCategory }} desc={{ en: item.enShortDesc ?? "", he: item.heShortDesc ?? "" }} hebrewUi={hebrewUi} />);
        }
      } else {
        flush();
        const d = descriptionPlacement(hebrewContent ? item.heShortDesc : item.enShortDesc);
        out.push(
          <section key={`s.${item.category}`} className={styles.category}>
            <h2 lang={lang(hebrewUi)}>
              {hebrewUi ? item.heCategory || item.category : item.category}
              {d.inline ? <span className={styles.inlineDesc}>{d.inline}</span> : null}
            </h2>
            {d.long ? <p className={styles.longDesc}>{d.long}</p> : null}
            <Contents contents={item.contents ?? []} cats={newCats} category={item.category} nest={nest + 1} he={he} hebrewContent={hebrewContent} hebrewUi={hebrewUi} />
          </section>,
        );
      }
    } else if (item.isCollection) {
      run.push(<Block key={`col.${item.slug}`} href={`${VOICES}/collections/${item.slug}`} title={{ en: item.title, he: item.heTitle }} desc={{ en: item.enShortDesc ?? "", he: item.heShortDesc ?? "" }} hebrewUi={hebrewUi} />);
    } else if (!item.hidden) {
      textBlock(item, `t.${item.title}`);
    }
  }
  flush();
  return <div>{out}</div>;
}
