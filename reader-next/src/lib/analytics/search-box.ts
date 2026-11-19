/**
 * The header search box's events, as HeaderAutocomplete.jsx sends them (all project "Global Search").
 *
 * @feature SRC-107 Header search gtag events
 * @feature ANL-007 Search box analytics and input constraints
 * @feature SRC-108 Legacy search event tracking
 */
import { gtagEvent, uaEvent } from "./core";

const P = { project: "Global Search" };
/** type_title_map: the link_type of a suggestion. */
const TYPE_TITLE: Record<string, string> = {
  Collection: "Collections", AuthorTopic: "Authors", TocCategory: "Categories", PersonTopic: "Topics", Topic: "Topics", ref: "Books", search: "", Term: "Terms", User: "Users",
};
const linkType = (type: string) => TYPE_TITLE[type] || type;
const keyLabel = (key: unknown) => (Array.isArray(key) ? key.join(",") : key == null ? undefined : String(key));

export const searchBoxAnalytics = {
  focus: () => gtagEvent("search_focus", P),
  defocus: (text: string) => gtagEvent("search_defocus", { ...P, text }),
  /** A suggestion chosen with Enter (keyboard) or a click (mouse); then the old redirectToObject's Track event. */
  navTo: (how: "keyboard" | "mouse", s: { type: string; label: string; key?: unknown }, text: string) => {
    if (how === "keyboard") gtagEvent("search_navto", { ...P, feature_name: "Nav To by Keyboard", link_type: linkType(s.type), text, to: s.label });
    else gtagEvent("search_navto", { ...P, feature_name: "Nav To by Mouse", to: s.label, text });
    uaEvent("Search", `Search Box Navigation - ${s.type}`, keyLabel(s.key));
  },
  /** A full-text search from the box (typed, or the "Search for" row clicked). */
  search: (query: string) => {
    uaEvent("Search", "Search Box Search", query);
    gtagEvent("search_submit", { ...P, feature_name: "Search Results", text: query });
  },
  /** Enter on something the box resolves itself (redirectOrSearch). */
  autolinkRef: (query: string, ref: string, isBook: boolean) => {
    gtagEvent("search_submit", { ...P, feature_name: "Autolink", text: query });
    uaEvent("Search", isBook ? "Search Box Navigation - Book" : "Search Box Navigation - Citation", ref);
  },
  autolinkTopic: (query: string) => {
    gtagEvent("search_submit", { ...P, feature_name: "Autolink", text: query });
    uaEvent("Search", "Search Box Navigation - Topic", query);
  },
  autolinkObject: (query: string, type: string, key: unknown) => {
    gtagEvent("search_submit", { ...P, feature_name: "Autolink", link_type: linkType(type), text: query });
    uaEvent("Search", `Search Box Navigation - ${type}`, keyLabel(key));
  },
};
