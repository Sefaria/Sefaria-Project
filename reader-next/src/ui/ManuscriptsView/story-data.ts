import related from "../../../fixtures/api/genesis-1/related.json";
import { manuscriptsForRefs, mediaForRefs } from "~/lib/connections/media";
import { groupByRef } from "~/lib/connections/related";

/** The real manuscript page and audio clip for Genesis 1:1. */
export const MANUSCRIPTS = manuscriptsForRefs(groupByRef(related.manuscripts as never[]), ["Genesis 1:1"]);
export const CLIPS = mediaForRefs(groupByRef(related.media as never[]), ["Genesis 1:1"]);
