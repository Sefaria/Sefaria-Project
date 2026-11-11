/**
 * The "Translations by language" pages, `/translations/<lang>`: which languages have one, their titles and descriptions, the About
 * blurb in each language, and the page's list of texts — built from `/api/texts/translations/<lang>` and the catalog by the old
 * TranslationsPage's rules (static/js/TranslationsPage.jsx), without the DOM.
 *
 * @feature LIB-020 Translations by language page
 * @feature LIB-021 Translations page backend and SEO
 * @feature LIB-029 Sidebar module: About translated text
 * @feature RTE-011 Translations page URLs
 */
import { refuse } from "~/lib/server-fn/input";
import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { SEFARIA_API_ORIGIN, apiJson } from "~/lib/api/client";
import { withPolicy } from "~/lib/cache/query-options";
import { buildCatalog, isCategory, serverCatalogTree, type TocNode } from "~/lib/catalog/toc";
import { tocObjectByCategories } from "~/lib/library/category-model";
import { serverTerms, type Terms } from "./terms";

export interface Bilingual {
  en: string;
  he: string;
}

export interface TranslationLanguage {
  /** English name ("German"). */
  name: string;
  /** The language's own name ("Deutsch"). */
  nativeName: string;
  /** The page's title, in that language: the h1, the document title (reader/views.py title_dictionary, Sefaria.ISOMap). */
  title: string;
  /** The page's meta description, in that language. */
  desc: string;
  /** Writing direction of the language (Sefaria.ISOMap defaultDirection). */
  dir: "ltr" | "rtl";
}

/**
 * The languages Django's translations_page accepts (reader/views.py title_dictionary), in its order. Any other slug loaded from the
 * server is a 404 — including "ro" and "tr", which the sidebar's language list links to: those open only inside the app (below).
 * Ladino ("lad") is commented out on the server.
 */
export const TRANSLATION_LANGUAGES: Readonly<Record<string, TranslationLanguage>> = {
  ar: { name: "Arabic", nativeName: "عربى", dir: "rtl", title: "نصوص يهودية بالعربية", desc: "أكبر مكتبة مجانية للنصوص اليهودية المتاحة للقراءة عبر الإنترنت باللغات العبرية والعربية والإنجليزية بما في ذلك التوراة والتناخ والتلمود والميشناه والمدراش والتعليقات والمزيد." },
  de: { name: "German", nativeName: "Deutsch", dir: "ltr", title: "Jüdische Texte in Deutscher Sprache", desc: "Die größte kostenlose Bibliothek jüdischer Texte, die online auf Hebräisch, Deutsch und Englisch gelesen werden kann, einschließlich Tora, Tanach, Talmud, Mischna, Midrasch, Kommentare und mehr." },
  en: { name: "English", nativeName: "English", dir: "ltr", title: "Jewish Texts in English", desc: "The largest free library of Jewish texts available to read online in Hebrew and English including Torah, Tanakh, Talmud, Mishnah, Midrash, commentaries and more." },
  eo: { name: "Esperanto", nativeName: "Esperanto", dir: "ltr", title: "Judaj Tekstoj en Esperanto", desc: "La plej granda senpaga biblioteko de judaj tekstoj legebla interrete en la hebrea, Esperanto kaj la angla inkluzive de Torao, Tanaĥo, Talmudo, Miŝnao, Midraŝo, komentaĵoj kaj pli." },
  es: { name: "Spanish", nativeName: "Español", dir: "ltr", title: "Textos Judíos en Español", desc: "La biblioteca gratuita más grande de textos judíos disponibles para leer en línea en hebreo, español e inglés, incluyendo Torá, Tanaj, Talmud, Mishná, Midrash, comentarios y más." },
  fa: { name: "Persian", nativeName: "فارسی", dir: "rtl", title: "متون یهودی به زبان فارسی", desc: "بزرگترین کتابخانه رایگان متون یهودی در دسترس برای خواندن آنلاین به زبان های عبری، فارسی و انگلیسی از جمله تورات، تناخ، تلمود، میشنا، میدراش، تفسیرها و غیره." },
  fi: { name: "Finnish", nativeName: "suomen kieli", dir: "ltr", title: "Juutalaiset tekstit suomeksi", desc: "Suurin ilmainen kirjasto juutalaisia tekstejä luettavaksi verkossa hepreaksi, suomeksi ja englanniksi, mukaan lukien Toora, Tanakh, Talmud, Mishna, Midrash, kommentit ja paljon muuta." },
  fr: { name: "French", nativeName: "Français", dir: "ltr", title: "Textes juifs en français", desc: "La plus grande bibliothèque gratuite de textes juifs disponibles à lire en ligne en hébreu, français et anglais, y compris Torah, Tanakh, Talmud, Mishnah, Midrash, commentaires et plus encore." },
  he: { name: "Hebrew", nativeName: "עברית", dir: "rtl", title: "ספריה בעברית", desc: "הספרייה החינמית הגדולה ביותר של טקסטים יהודיים הזמינים לקריאה מקוונת בעברית ובאנגלית, לרבות תורה, תנח, תלמוד, משנה, מדרש, פירושים ועוד." },
  it: { name: "Italian", nativeName: "Italiano", dir: "ltr", title: "Testi ebraici in italiano", desc: "La più grande libreria gratuita di testi ebraici disponibile per la lettura online in ebraico, italiano e inglese, inclusi Torah, Tanakh, Talmud, Mishnah, Midrash, commenti e altro ancora." },
  pl: { name: "Polish", nativeName: "Polski", dir: "ltr", title: "Teksty żydowskie w języku polskim", desc: "Największa bezpłatna biblioteka tekstów żydowskich dostępna do czytania online w języku hebrajskim, polskim i angielskim, w tym Tora, Tanach, Talmud, Miszna, Midrasz, komentarze i wiele innych." },
  pt: { name: "Portuguese", nativeName: "Português", dir: "ltr", title: "Textos judaicos em portugues", desc: "A maior biblioteca gratuita de textos judaicos disponível para leitura online em hebraico, português e inglês, incluindo Torá, Tanakh, Talmud, Mishnah, Midrash, comentários e muito mais." },
  ru: { name: "Russian", nativeName: "Pусский", dir: "ltr", title: "Еврейские тексты на русском языке", desc: "Самая большая бесплатная библиотека еврейских текстов, доступных для чтения онлайн на иврите, русском и английском языках, включая Тору, Танах, Талмуд, Мишну, Мидраш, комментарии и многое другое." },
  yi: { name: "Yiddish", nativeName: "יידיש", dir: "rtl", title: "יידישע טעקסטן אויף יידיש", desc: "די גרעסטע פרייע ביבליאָטעק פון יידישע טעקסטן צו לייענען אָנליין אין לשון קדוש ,יידיש און ענגליש. תורה, תנך, תלמוד, משנה, מדרש, פירושים און אזוי אנדערע." },
};

/** Is there a translations page for this slug? Exact and case-sensitive, as Django's dictionary lookup (`/translations/DE` is a 404). */
export const isTranslationSlug = (slug: string): boolean => Object.prototype.hasOwnProperty.call(TRANSLATION_LANGUAGES, slug);

/**
 * Languages the old client opens a page for only when it is reached inside the app: its openURL sends any `/translations/<slug>` to
 * the TranslationsPage (ReaderApp.jsx), titled by Sefaria.getHebrewTitle from Sefaria.ISOMap, while Django has no page for them (a
 * direct load or reload is a 404). The library sidebar's language list links to two of them, Română and Türkçe. These are ISOMap's
 * other languages; an ISOMap entry without a title is called "Jewish Texts in <name>" (getHebrewTitle).
 */
export const IN_APP_TRANSLATION_LANGUAGES: Readonly<Record<string, TranslationLanguage>> = {
  ro: { name: "Romanian", nativeName: "română", dir: "ltr", title: "Texte evreiești în limba română", desc: "" },
  tr: { name: "Turkish", nativeName: "Türkçe", dir: "ltr", title: "Türkçe Yahudi Metinleri", desc: "" },
  lad: { name: "Ladino", nativeName: "Judeo-español", dir: "ltr", title: "Jewish Texts in Ladino", desc: "" },
  jrb: { name: "Judeo-Arabic", nativeName: "Arabia Yehudia", dir: "rtl", title: "Jewish Texts in Judeo-Arabic", desc: "" },
};

/**
 * The language of a translations page: Django's languages always; the in-app-only ones (above) only when `inApp` — the page was
 * reached by navigating inside the app, not loaded from the server. Undefined: no page (a 404).
 */
export function translationLanguage(slug: string, inApp: boolean): TranslationLanguage | undefined {
  if (isTranslationSlug(slug)) return TRANSLATION_LANGUAGES[slug];
  return inApp && Object.prototype.hasOwnProperty.call(IN_APP_TRANSLATION_LANGUAGES, slug) ? IN_APP_TRANSLATION_LANGUAGES[slug] : undefined;
}

/**
 * The About module of a translations page (the old AboutTranslatedText): a title and blurb in the page's language. English and
 * Hebrew have none and show the library's own "A Living Library of Torah" module in the interface language.
 */
export const ABOUT_TRANSLATED_TEXT: Readonly<Record<string, { title: string; body: string }>> = {
  ar: { title: "نصوص يهودية بالعربية", body: "سفاريا هي موطن 3000 سنة من النصوص اليهودية. نحن منظمة غير ربحية تقدم وصولاً مجانيًا إلى النصوص والترجمات والتعليقات حتى يتمكن الجميع من المشاركة في العملية المستمرة لدراسة التوراة وتفسيرها وخلقها." },
  de: { title: "Eine lebendige Bibliothek der Tora", body: "Sefaria ist eine Bibliothek für jüdische Texte aus 3.000 Jahren. Wir sind eine gemeinnützige Organisation, die freien Zugang zu Texten, Übersetzungen und Kommentaren bietet, damit jede und jeder am fortlaufenden Prozess des Studierens, Interpretierens und der Entwicklung der Tora teilnehmen kann." },
  eo: { title: "Vivanta Biblioteko de Torao", body: "Sefaria estas hejmo de 3,000 jaroj da judaj tekstoj. Ni estas neprofitcela organizo ofertanta senpagan aliron al tekstoj, tradukoj kaj komentaĵoj por ke ĉiuj povu partopreni en la daŭra procezo de studado, interpretado kaj kreado de Torao." },
  es: { title: "Una biblioteca viva de la Torá", body: "Sefaria alberga 3.000 años de textos judíos. Somos una organización sin fines de lucro que ofrece acceso gratuito a textos, traducciones y comentarios para que todos puedan participar en el proceso continuo de estudio, interpretación y creación de la Torá." },
  fa: { title: "کتابخانه زنده تورات", body: "سفاریا خانه 3000 سال متون یهودی است. ما یک سازمان غیرانتفاعی هستیم که دسترسی رایگان به متون، ترجمه ها و تفسیرها را ارائه می دهیم تا همه بتوانند در روند مداوم مطالعه، تفسیر و ایجاد تورات شرکت کنند." },
  fi: { title: "Tooran elävä kirjasto", body: "Sefaria on koti 3000 vuoden juutalaisille teksteille. Olemme voittoa tavoittelematon organisaatio, joka tarjoaa ilmaisen pääsyn teksteihin, käännöksiin ja kommentteihin, jotta kaikki voivat osallistua jatkuvaan Tooran opiskelu-, tulkkaus- ja luomisprosessiin." },
  fr: { title: "Une bibliothèque vivante de la Torah", body: "Une bibliothèque de Torah vivante. Sefaria abrite 3 000 ans de textes juifs. Nous sommes une organisation à but non lucratif offrant un accès gratuit aux textes de la Torah, aux commentaires et aux traductions, afin que chacun puisse participer au processus infini de l'étude, de l'interprétation et de la création de la Torah." },
  it: { title: "Una biblioteca vivente della Torah", body: "Sefaria ospita 3.000 anni di testi ebraici. Siamo un'organizzazione senza scopo di lucro che offre libero accesso a testi, traduzioni e commenti in modo che tutti possano partecipare al processo in corso di studio, interpretazione e creazione della Torah." },
  pl: { title: "Żywa Biblioteka Tory", body: "Sefaria jest domem dla 3000 lat żydowskich tekstów. Jesteśmy organizacją nonprofit oferującą bezpłatny dostęp do tekstów, tłumaczeń i komentarzy, dzięki czemu każdy może uczestniczyć w bieżącym procesie studiowania, tłumaczenia i tworzenia Tory." },
  pt: { title: "Uma Biblioteca Viva da Torá", body: "Sefaria é o lar de 3.000 anos de textos judaicos. Somos uma organização sem fins lucrativos que oferece acesso gratuito a textos, traduções e comentários para que todos possam participar do processo contínuo de estudo, interpretação e criação da Torá." },
  ru: { title: "Живая библиотека Торы", body: "Сефария является домом для еврейских текстов 3000-летней давности. Мы — некоммерческая организация, предлагающая бесплатный доступ к текстам, переводам и комментариям, чтобы каждый мог участвовать в продолжающемся процессе изучения, толкования и создания Торы." },
  yi: { title: "א לעבעדיקע ביבליאטעק פון תורה", body: "אין ספֿריאַ איז אַ היים פֿון 3,000 יאָר ייִדישע טעקסטן. מיר זענען אַ נאַן-נוץ אָרגאַניזאַציע וואָס אָפפערס פריי אַקסעס צו טעקסטן, איבערזעצונגען און קאָמענטאַרן אַזוי אַז אַלעמען קענען אָנטייל נעמען אין די אָנגאָינג פּראָצעס פון לערנען, ינטערפּריטיישאַן און שאפן תורה." },
};

/** One text of `/api/texts/translations/<lang>` (reader/views.py translations_api). */
export interface RawTranslationItem {
  title: string;
  /** The reader at the text's first section in that translation (`/Genesis.1?ven=german%7C…&lang=bi`), or for an English/Hebrew
   *  commentary bundled by collective title, its category page (`/texts/Tanakh/Rishonim on Tanakh/Rashi`, spaces unescaped). */
  url: string;
  order?: number[];
  versionTitle?: string;
  rtlLanguage?: string;
}
/** corpus → second-level category ("Uncategorized" when the text has only one) → texts. */
export type RawTranslations = Record<string, Record<string, RawTranslationItem[]>>;

export interface TranslationLink {
  title: Bilingual;
  url: string;
}
export interface TranslationGroup {
  category: Bilingual;
  items: TranslationLink[];
}
export interface TranslationCorpus {
  corpus: Bilingual;
  /** Texts directly under the corpus (its "Uncategorized" texts that the catalog lists at its top), first; null when the corpus has
   *  no "Uncategorized" texts at all — an empty list still renders (an empty row, as the old page did). */
  prioritized: TranslationLink[] | null;
  /** One closed/open block per sub-category, in the catalog's order. */
  groups: TranslationGroup[];
  /** The rest of "Uncategorized": titles in English only (the old page did not translate them). */
  uncategorized: TranslationLink[];
}
export interface TranslationsPageModel {
  slug: string;
  sections: TranslationCorpus[];
}

/** The old sortFx: by the first number of `order` when both texts have one, otherwise as they came (a stable sort). */
const byOrder = (a: RawTranslationItem, b: RawTranslationItem) => (a.order && b.order ? a.order[0]! - b.order[0]! : 0);

/**
 * The page's sections from the API answer and the catalog: the corpora in library order (those the catalog does not have are not
 * shown), each with its prioritised texts, its sub-categories in the catalog's order (those the catalog does not have are dropped)
 * and the leftover "Uncategorized" texts. Hebrew names as the old Sefaria._ → hebrewTerm: the terms dictionary first (`terms`), then
 * the catalog — a category's Hebrew name, a text's index title, a bundled commentary's category. A port of TranslationsPage.jsx.
 */
export function buildTranslationsPage(tree: readonly TocNode[], raw: RawTranslations, slug: string, terms?: Terms | null): TranslationsPageModel {
  const books = buildCatalog([...tree]).books;
  const term = (name: string) => terms?.[name]?.he || undefined;
  const heTitle = (item: RawTranslationItem): string => {
    const t = term(item.title);
    if (t) return t;
    const book = books.get(item.title);
    if (book) return book.heTitle || item.title;
    if (item.url.startsWith("/texts/")) {
      const cat = tocObjectByCategories(tree, decodeURIComponent(item.url.slice("/texts/".length)).split("/"));
      if (cat) return cat.heCategory || item.title;
    }
    return item.title;
  };
  const link = (item: RawTranslationItem): TranslationLink => ({ title: { en: item.title, he: heTitle(item) }, url: item.url });
  const sorted = (items: readonly RawTranslationItem[]) => [...items].sort(byOrder);
  const sections: TranslationCorpus[] = [];
  for (const top of tree) {
    if (!isCategory(top) || !Object.prototype.hasOwnProperty.call(raw, top.category)) continue;
    const corpus = raw[top.category]!;
    const contents = top.contents ?? [];
    const direct = new Set(contents.filter((n) => !isCategory(n)).map((n) => (n as { title: string }).title));
    const unc = corpus.Uncategorized;
    sections.push({
      corpus: { en: top.category, he: term(top.category) || top.heCategory || top.category },
      prioritized: unc ? sorted(unc.filter((t) => direct.has(t.title))).map(link) : null,
      groups: contents
        .filter(isCategory)
        .filter((c) => Object.prototype.hasOwnProperty.call(corpus, c.category))
        .map((c) => ({ category: { en: c.category, he: term(c.category) || c.heCategory || c.category }, items: sorted(corpus[c.category]!).map(link) })),
      uncategorized: unc ? sorted(unc.filter((t) => !direct.has(t.title))).map((t) => ({ title: { en: t.title, he: t.title }, url: t.url })) : [],
    });
  }
  return { slug, sections };
}

/** `/api/texts/translations/<lang>`. */
export async function fetchTranslations(slug: string, signal?: AbortSignal): Promise<RawTranslations> {
  const r = await fetch(`${SEFARIA_API_ORIGIN}/api/texts/translations/${encodeURIComponent(slug)}`, { signal });
  return apiJson<RawTranslations>(r, `Translations ${slug}`);
}

/** How long the server keeps a page's model (the list changes when a translation is added), and a failure (the API's 500 for "he"). */
const MODEL_TTL_MS = 10 * 60_000;
const FAILURE_TTL_MS = 60_000;
/**
 * At most this many models are kept (the oldest goes first), as the other module caches (route-manifest NAME_MAX, language-domain
 * PROBE_MAX). The server function only lets the known languages through (validateTranslationSlug), so this is a second guard: the Map
 * can never grow with what a caller sends.
 */
export const SHARED_MODELS_MAX = 32;
const shared = new Map<string, { at: number; ttl: number; model: Promise<TranslationsPageModel> }>();

/**
 * The page's model, shared by every request for a while: one upstream call per language however many readers ask, and a request that
 * comes while one is under way joins it — so the browser's own ask after the server's page (when the server did not wait for the list,
 * see prefetchTranslationsPage) gets the same answer, or the same failure, without a second slow call. Server only.
 */
export function sharedTranslationsModel(slug: string, load: (slug: string) => Promise<TranslationsPageModel>, now = Date.now()): Promise<TranslationsPageModel> {
  const hit = shared.get(slug);
  if (hit && now - hit.at < hit.ttl) return hit.model;
  const model = load(slug);
  const entry = { at: now, ttl: MODEL_TTL_MS, model };
  shared.delete(slug);
  while (shared.size >= SHARED_MODELS_MAX) shared.delete(shared.keys().next().value as string);
  shared.set(slug, entry);
  model.catch(() => {
    if (shared.get(slug) === entry) entry.ttl = Date.now() - entry.at + FAILURE_TTL_MS;
  });
  return model;
}
/** Tests only. */
export const clearSharedTranslationsModels = () => shared.clear();
/** Tests only. */
export const sharedTranslationsModelCount = () => shared.size;

/**
 * The server function's input: a slug that has a page, Django's languages or the in-app-only ones (translationLanguage(slug, true)),
 * as the route accepts. The function is a public GET endpoint (`/_serverFn/<id>?payload=…`), so anything else is refused before any
 * upstream call or cache entry.
 */
export function validateTranslationSlug(slug: unknown): string {
  if (typeof slug !== "string" || !translationLanguage(slug, true)) throw refuse("Unknown translations language");
  return slug;
}

/**
 * The model is always built on the server, from the catalog and terms it keeps for every request: the browser gets only the page's
 * few kilobytes, never the catalog (3.5 MB) or the terms (in the 9 MB `/data.js`), also when it navigates here.
 */
const loadOnServer = createServerFn({ method: "GET" })
  .validator(validateTranslationSlug)
  .handler(({ data: slug }): Promise<TranslationsPageModel> =>
    sharedTranslationsModel(slug, async (lang) => {
      const [tree, raw, terms] = await Promise.all([serverCatalogTree(), fetchTranslations(lang), serverTerms()]);
      return buildTranslationsPage(tree, raw, lang, terms);
    }),
  );

/**
 * The page's model, a catalog-class query of its own, put in the server's page. The API's failure (it answers 500 for "he" on
 * sefaria.org, 2026-11-04) is an error the page shows as an empty list, as the old page did.
 */
export const translationsPageQueryOptions = (slug: string) =>
  queryOptions<TranslationsPageModel>({
    ...withPolicy("catalog", {
      queryKey: ["translations", "page", slug] as const,
      queryFn: (): Promise<TranslationsPageModel> => loadOnServer({ data: slug }),
    }),
    retry: false,
  });

/**
 * How long the page waits for its list before it shows without it. The old page showed its title at once and filled the list in when
 * `/api/texts/translations/<lang>` answered; this one puts the list in the server's page when it comes quickly (nearly always), and
 * otherwise does not hold the page back — sefaria.org's API answers "he" with a 500 after ~16s — the list then follows in the browser.
 */
export const LIST_WAIT_MS = 1500;

/**
 * The route's prefetch: on the server, the model when it is ready within `waitMs` (put in the cache, so in the server's page); in the
 * browser (in-app navigation), the query, waited on for at most `waitMs`. Never throws: a failure leaves the list empty.
 */
export async function prefetchTranslationsPage(queryClient: QueryClient, slug: string, waitMs = LIST_WAIT_MS): Promise<void> {
  const options = translationsPageQueryOptions(slug);
  if (queryClient.getQueryData(options.queryKey)) return;
  let stop = () => {};
  const timeout = new Promise<undefined>((resolve) => {
    const timer = setTimeout(resolve, waitMs);
    stop = () => clearTimeout(timer);
  });
  try {
    if (typeof window === "undefined") {
      // not through the query: a pending query would be sent to the browser and hold the page's stream open until the API answers
      const model = await Promise.race([loadOnServer({ data: slug }).catch(() => undefined), timeout]);
      if (model) queryClient.setQueryData(options.queryKey, model);
    } else {
      await Promise.race([queryClient.ensureQueryData(options).catch(() => undefined), timeout]);
    }
  } finally {
    stop();
  }
}
