import { groupByMethod, parseFindings, type Finding } from "~/lib/connections/findings";
import answer from "./genesis-1-findings.json";

/**
 * Made-up findings on Genesis 1 (genesis-1-findings.json, which e2e/findings.spec.ts serves too) in the shape the Library Assistant's
 * findings API answers (`GET <apiBaseUrl>/findings/ref/Genesis 1`).
 * The methods, people and sheets are placeholders.
 */
export const GENESIS_1_ANSWER = answer;

export const GENESIS_1: Finding[] = parseFindings(GENESIS_1_ANSWER);
export const GROUPS = groupByMethod(GENESIS_1);
