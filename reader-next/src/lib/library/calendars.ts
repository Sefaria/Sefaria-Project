/**
 * Today's learning schedules (`GET /api/calendars?diaspora=1|0`): the weekly portion, its haftarah, Daf Yomi. Short-lived data:
 * cached for the day's session only.
 *
 * @feature LIB-038 Sidebar module: Learning schedules
 * @feature LIB-039 Sidebar module: Weekly Torah portion
 * @feature LIB-040 Sidebar module: Daf Yomi
 */
import { queryOptions } from "@tanstack/react-query";
import { SEFARIA_API_ORIGIN, SefariaApiError } from "~/lib/api/client";
import { withPolicy } from "~/lib/cache/query-options";

export interface Bilingual {
  en: string;
  he: string;
}
export interface CalendarItem {
  title: Bilingual;
  displayValue: Bilingual;
  url: string;
  ref: string;
  heRef?: string;
  order?: number;
}

/**
 * `diaspora`: the old site's request.diaspora — false for readers in Israel, whose weekly portion differs in some weeks (decided by
 * the server from the request's country: src/routes/__root.tsx). Kept in memory only (CODE_REVIEW R-21: it was kept 90 days on
 * disk, so a reader offline or back after a week saw last week's portion first).
 */
export const calendarsQueryOptions = (diaspora = true) =>
  queryOptions<CalendarItem[]>({
    ...withPolicy("search", {
      queryKey: ["calendars", diaspora ? "diaspora" : "israel"] as const,
      queryFn: async ({ signal }: { signal: AbortSignal }): Promise<CalendarItem[]> => {
        const r = await fetch(`${SEFARIA_API_ORIGIN}/api/calendars?diaspora=${diaspora ? 1 : 0}`, { signal });
        if (!r.ok) throw new SefariaApiError(`Calendars: HTTP ${r.status}`, r.status);
        return ((await r.json()) as { calendar_items: CalendarItem[] }).calendar_items;
      },
    }),
    staleTime: 60 * 60 * 1000,
  });

export const parashah = (items: readonly CalendarItem[]) => items.find((c) => c.title.en === "Parashat Hashavua");
export const haftarot = (items: readonly CalendarItem[]) => items.filter((c) => c.title.en.startsWith("Haftarah"));
export const dafYomi = (items: readonly CalendarItem[]) => items.find((c) => c.title.en === "Daf Yomi");
