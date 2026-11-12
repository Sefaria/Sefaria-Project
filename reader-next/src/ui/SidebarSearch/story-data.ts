import { mergeTextResultsVersions, type SearchHit } from "~/lib/search/text-search";
import light from "../../../fixtures/api/search/genesis-light.json";
import hebrew from "../../../fixtures/api/search/genesis-hebrew-or.json";

export const LIGHT = mergeTextResultsVersions(light.hits.hits as unknown as SearchHit[]);
export const HEBREW_OR = mergeTextResultsVersions(hebrew.hits.hits as unknown as SearchHit[]);
export const hrefFor = (hit: SearchHit) => `/${hit._source.ref.replace(/ /g, "_").replace(/:/g, ".")}`;
