import pages from "../../../fixtures/api/berakhot-2a/websites-2a-1.json";
import { sitesOf, sortPages, type WebPageItem } from "~/lib/connections/webpages";

/** The real web pages citing Berakhot 2a:1 (516 pages, 31 sites). */
export const ALL = sortPages(pages as unknown as WebPageItem[], "english");
export const SITES = sitesOf(ALL, "english");
export const HADRAN = ALL.filter((p) => p.siteName === "Hadran").slice(0, 6);
