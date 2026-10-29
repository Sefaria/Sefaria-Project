/**
 * Real API responses (fixtures/api) normalised for stories and tests. Keep this list to small
 * fixtures: they are bundled into Storybook.
 */
import { normaliseTexts, type RawTextsResponse, type TextPassage } from "~/lib/text/model";
import genesis from "@fixtures/genesis-1/v3-texts.json";
import berakhot from "@fixtures/berakhot-2a/v3-texts.json";
import psalms from "@fixtures/psalms-23/v3-texts.json";
import rashi from "@fixtures/rashi-on-genesis-1/section-first.json";
import yerushalmi from "@fixtures/jt-berakhot-1-1/v3-texts.json";
import haggadah from "@fixtures/pesach-haggadah-kadesh/v3-texts.json";
import jastrow from "@fixtures/jastrow-abba-1/v3-texts.json";
import mishnah from "@fixtures/mishnah-berakhot-1/v3-texts.json";
import shulchanArukh from "@fixtures/shulchan-arukh-oc-1/v3-texts.json";
import onkelos from "@fixtures/onkelos-genesis-1/v3-texts.json";

const n = (raw: unknown): TextPassage => normaliseTexts(raw as RawTextsResponse);

export const PASSAGES = {
  genesis1: n(genesis),
  onkelosGenesis1: n(onkelos),
  psalms23: n(psalms),
  berakhot2a: n(berakhot),
  mishnahBerakhot1: n(mishnah),
  yerushalmi: n(yerushalmi),
  rashiGenesis1_1: n(rashi),
  shulchanArukh: n(shulchanArukh),
  haggadahKadesh: n(haggadah),
  jastrowAbba: n(jastrow),
} as const;

export type PassageKey = keyof typeof PASSAGES;
