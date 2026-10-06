/**
 * Today's learning schedules (`GET /api/calendars?diaspora=1`): the weekly portion, its haftarah, Daf Yomi. Short-lived data:
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

export const calendarsQueryOptions = () =>
  queryOptions<CalendarItem[]>({
    ...withPolicy("reference", {
      queryKey: ["calendars", "diaspora"] as const,
      queryFn: async ({ signal }: { signal: AbortSignal }): Promise<CalendarItem[]> => {
        const r = await fetch(`${SEFARIA_API_ORIGIN}/api/calendars?diaspora=1`, { signal });
        if (!r.ok) throw new SefariaApiError(`Calendars: HTTP ${r.status}`, r.status);
        return ((await r.json()) as { calendar_items: CalendarItem[] }).calendar_items;
      },
    }),
    staleTime: 60 * 60 * 1000,
  });

export const parashah = (items: readonly CalendarItem[]) => items.find((c) => c.title.en === "Parashat Hashavua");
export const haftarot = (items: readonly CalendarItem[]) => items.filter((c) => c.title.en.startsWith("Haftarah"));
export const dafYomi = (items: readonly CalendarItem[]) => items.find((c) => c.title.en === "Daf Yomi");
