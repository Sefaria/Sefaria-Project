import related from "../../../fixtures/api/genesis-1/related.json";
import { groupByRef, type RelatedTopic } from "~/lib/connections/related";
import { topicsForRefs } from "~/lib/connections/topics";

/** The real topics of Genesis 1:1 (the same seven sefaria.org lists). */
export const GENESIS_1_1 = topicsForRefs(groupByRef(related.topics as unknown as RelatedTopic[]), ["Genesis 1:1"]);
