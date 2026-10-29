import { mergeTextResultsVersions, type SearchHit } from "~/lib/search/text-search";
import { buildFilterTree } from "~/lib/search/search-page";
import type { EntityHit } from "~/lib/search/entity-search";
import light from "../../../fixtures/api/search/genesis-light.json";
import agg from "../../../fixtures/api/search/agg-light.json";
import books from "../../../fixtures/api/search/entity-book-light.json";
import authors from "../../../fixtures/api/search/entity-author-light.json";
import topics from "../../../fixtures/api/search/entity-topic-light.json";

export const HITS = mergeTextResultsVersions(light.hits.hits as unknown as SearchHit[]);
export const hrefFor = (hit: SearchHit) => `/${hit._source.ref.replace(/ /g, "_").replace(/:/g, ".")}`;

const TOPS = ["Tanakh", "Mishnah", "Talmud", "Midrash", "Halakhah", "Kabbalah", "Liturgy", "Jewish Thought", "Tosefta", "Chasidut", "Musar", "Responsa", "Second Temple", "Reference"];
const order = new Map(TOPS.map((t, i) => [t, i]));
const buckets = (agg as unknown as { aggregations: { path: { buckets: { key: string; doc_count: number }[] } } }).aggregations.path.buckets;
export const TREE = buildFilterTree(buckets, [], order, (c) => c);
export const TREE_APPLIED = buildFilterTree(buckets, ["Kabbalah"], order, (c) => c);

export const BOOKS = (books as { hits: EntityHit[] }).hits;
export const AUTHORS = (authors as { hits: EntityHit[] }).hits;
export const TOPICS = (topics as { hits: EntityHit[] }).hits;
