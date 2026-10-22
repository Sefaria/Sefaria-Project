import words from "../../../fixtures/api/genesis-1/words-bereshit.json";
import jastrowAbba from "../../../fixtures/api/jastrow-abba-1/words.json";
import type { LexiconEntryData } from "~/lib/lexicon/lookup";

/** Real responses: בְּרֵאשִׁ֖ית in Genesis 1:1 (BDB Augmented Strong, Jastrow, BDB) and אבא (Jastrow, Klein…). */
export const BERESHIT = words as unknown as LexiconEntryData[];
export const ABBA = jastrowAbba as unknown as LexiconEntryData[];
