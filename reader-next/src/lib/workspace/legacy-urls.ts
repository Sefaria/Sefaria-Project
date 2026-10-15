/**
 * Multi-panel URLs exactly as www.sefaria.org writes them, recorded with scripts/probes/multipanel-probe*.mjs (desktop,
 * 2026-10-06). The decoded form (decodeURIComponent) is what is compared. Owner decision 2026-10-06: this client reads every one
 * of these and writes them back byte for byte (docs/MULTIPANEL_PLAN.md §3).
 */
export interface LegacyUrlCase {
  /** What was on screen, as the old flat panel list ("+sidebar" = a connections panel right after it). */
  layout: string;
  /** How sefaria.org got there. */
  how: string;
  url: string;
  /** Not yet written back exactly: which plan step fixes it (docs/MULTIPANEL_PLAN.md). The test expects it to fail until then. */
  todo?: string;
}

export const LEGACY_URLS: LegacyUrlCase[] = [
  { layout: "[Genesis 1]", how: "open", url: "/Genesis.1?lang=bi&aliyot=0" },
  { layout: "[Genesis 1:1 +sidebar]", how: "verse click", url: "/Genesis.1.1?lang=bi&with=all&lang2=en" },
  { layout: "[Genesis 1:1 +sidebar(Commentary)]", how: "category", url: "/Genesis.1.1?lang=bi&with=Commentary ConnectionsList&lang2=en" },
  { layout: "[Genesis 1:1 +sidebar(Rashi)]", how: "commentator", url: "/Genesis.1.1?lang=bi&with=Rashi&lang2=en" },
  { layout: "[Genesis 1:1, Rashi on Genesis 1:1:1]", how: "'Open' in the sidebar", url: "/Genesis.1.1?lang=bi&aliyot=0&p2=Rashi_on_Genesis.1.1.1&lang2=bi" },
  { layout: "[Genesis 1, Exodus 1]", how: "URL", url: "/Genesis.1?lang=bi&aliyot=0&p2=Exodus.1&lang2=bi&aliyot2=0" },
  { layout: "[Genesis 1:1 +sidebar, Exodus 1]", how: "verse in panel 1", url: "/Genesis.1.1?lang=bi&with=all&lang2=en&p3=Exodus.1&lang3=bi&aliyot3=0" },
  { layout: "[Genesis 1, Exodus 1:1 +sidebar]", how: "verse in panel 2", url: "/Genesis.1?lang=bi&aliyot=0&p2=Exodus.1.1&lang2=bi&aliyot2=0&w2=all&lang3=en" },
  { layout: "[Ramban on Genesis 1:1:1, Exodus 12:2]", how: "citation", url: "/Ramban_on_Genesis.1.1.1?lang=bi&p2=Exodus.12.2&lang2=bi&aliyot2=0" },
  { layout: "[Genesis 1:1 +sidebar(Translation Open)]", how: "translation preview", url: "/Genesis.1.1?lang=bi&vside=The_Contemporary_Torah,_Jewish_Publication_Society,_2006|en&with=Translation Open&lang2=bi" },
  { layout: "[Genesis 1:1, Genesis 1:1 (translation)]", how: "translation 'Open Text'", url: "/Genesis.1.1?lang=bi&aliyot=0&p2=Genesis.1.1&ven2=english|The_Contemporary_Torah,_Jewish_Publication_Society,_2006&lang2=bi&aliyot2=0" },
  { layout: "[Genesis 1:1 +sidebar(Lexicon)]", how: "URL", url: "/Genesis.1.1?lang=bi&lookup=בראשית&with=Lexicon&lang2=bi" },
  { layout: "[Genesis 1:1 +sidebar(Lexicon), Genesis 1:1]", how: "citation inside a dictionary entry", url: "/Genesis.1.1?lang=bi&lookup=בראשית&with=Lexicon&lang2=bi&p3=Genesis.1.1&lang3=bi&aliyot3=0" },
  // Compare panel (Step 4: panel kinds beyond text)
  { layout: "[Genesis 1:1, compare: library]", how: "Compare Text", url: "/Genesis.1.1?lang=bi&aliyot=0&p2=texts", todo: "Step 4: compare panel kinds (a library page is not a text)" },
  { layout: "[Genesis 1:1, compare: Tanakh]", how: "compare → Tanakh", url: "/Genesis.1.1?lang=bi&aliyot=0&p2=texts/Tanakh", todo: "Step 4: compare panel kinds (a library page is not a text)" },
  { layout: "[Genesis 1:1, compare: Exodus contents]", how: "compare → Exodus", url: "/Genesis.1.1?lang=bi&aliyot=0&p2=Exodus&tab2=contents", todo: "Step 4: compare panel kinds (book contents tab)" },
  { layout: "[Genesis 1:1, Exodus 2]", how: "compare → chapter 2", url: "/Genesis.1.1?lang=bi&aliyot=0&p2=Exodus.2&lang2=bi&aliyot2=0" },
];
