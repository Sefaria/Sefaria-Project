import berakhotDetails from "../../../fixtures/api/berakhot-2a/index-contracted.json";
import berakhotText from "../../../fixtures/api/berakhot-2a/v3-texts.json";
import berakhotVersions from "../../../fixtures/api/berakhot-2a/versions.json";
import genesisDetails from "../../../fixtures/api/genesis-1/index-contracted.json";
import genesisText from "../../../fixtures/api/genesis-1/v3-texts.json";
import genesisVersions from "../../../fixtures/api/genesis-1/versions.json";
import rashiDetails from "../../../fixtures/api/rashi-on-genesis-1/index-contracted.json";
import rashiText from "../../../fixtures/api/rashi-on-genesis-1/v3-texts.json";
import rashiVersions from "../../../fixtures/api/rashi-on-genesis-1/versions.json";
import type { IndexDetails } from "~/lib/catalog/index-details";
import type { VersionMeta } from "~/lib/text/model";
import { aboutVersions, versionSectionOrder } from "~/lib/versions/about";
import type { DownloadableVersion } from "../DownloadVersions/DownloadVersions";
import type { AboutViewProps } from "./AboutView";

const available = (t: unknown) => (t as { available_versions: VersionMeta[] }).available_versions;

function props(details: unknown, text: unknown, all: unknown, translationTitle: string, urlRef: string, category: { en: string; he: string }): AboutViewProps {
  return {
    details: details as IndexDetails,
    category,
    lang: "en",
    titleHref: `/${(details as IndexDetails).title.replace(/ /g, "_")}`,
    authorHref: (slug) => `https://www.sefaria.org/topics/${slug}`,
    topicHref: (slug) => `https://www.sefaria.org/topics/${slug}`,
    versions: aboutVersions(available(text), { translationTitle }),
    order: versionSectionOrder("english"),
    urlRef,
    selectSourceHref: (v) => `/${urlRef}?vhe=${v.languageFamilyName}|${v.versionTitle.replace(/ /g, "_")}`,
    openHref: (v) => `/${urlRef}?vside=${v.versionTitle.replace(/ /g, "_")}|${v.language}&with=Version Open`,
    bookVersions: all as DownloadableVersion[],
  };
}

/** Real data, as the API returned it: the three books the About view was checked against on sefaria.org. */
export const GENESIS = props(genesisDetails, genesisText, genesisVersions, "THE JPS TANAKH: Gender-Sensitive Edition", "Genesis.1.1", { en: "Tanakh", he: "תנ״ך" });
export const BERAKHOT = props(berakhotDetails, berakhotText, berakhotVersions, "William Davidson Edition - English", "Berakhot.2a.1", { en: "Talmud", he: "תלמוד" });
export const RASHI = props(rashiDetails, rashiText, rashiVersions, "Pentateuch with Rashi's commentary by M. Rosenbaum and A.M. Silbermann, 1929-1934", "Rashi_on_Genesis.1.1.1", { en: "Commentary", he: "מפרשים" });
