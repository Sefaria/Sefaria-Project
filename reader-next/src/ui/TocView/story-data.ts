import { tocStructures, type TocIndexRecord } from "~/lib/toc/model";
import genesis from "../../../fixtures/api/genesis-1/index-contracted.json";
import berakhot from "../../../fixtures/api/berakhot-2a/index-contracted.json";
import haggadah from "../../../fixtures/api/pesach-haggadah-kadesh/index-contracted.json";
import zohar from "../../../fixtures/api/zohar-bereshit-1/index-contracted.json";
import jastrow from "../../../fixtures/api/jastrow-abba-1/index-contracted.json";

const rec = (x: unknown) => x as unknown as TocIndexRecord;
export const GENESIS = tocStructures(rec(genesis), { ref: "Genesis 2:3", sectionRef: "Genesis 2" });
export const BERAKHOT = tocStructures(rec(berakhot), { ref: "Berakhot 3b:2", sectionRef: "Berakhot 3b" });
export const BERAKHOT_BOTH = tocStructures({ ...rec(berakhot), exclude_structs: [] }, { ref: "Berakhot 3b:2", sectionRef: "Berakhot 3b" });
export const HAGGADAH = tocStructures(rec(haggadah), { ref: "Pesach Haggadah, Kadesh 3", sectionRef: "Pesach Haggadah, Kadesh" });
export const ZOHAR = tocStructures(rec(zohar), {});
export const JASTROW = tocStructures(rec(jastrow), { sectionRef: "Jastrow, א" });
