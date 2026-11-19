/**
 * The library home's daily dedication (the old TextsPage Dedication): a public Google Sheet of date, English and Hebrew columns,
 * read through its visualization endpoint (`gviz/tq`, which answers sefaria.org's origins with CORS) instead of loading Google
 * Charts. The day turns at 6 pm local time (the reader's clock + 6 hours). Nothing shows for a day without text. VERIFIED
 * 2026-11-10: the sheet answers rows for today and tomorrow, both empty.
 *
 * @feature LIB-005 Daily dedication banner
 */
import { queryOptions } from "@tanstack/react-query";

export const DEDICATION_SHEET = "https://docs.google.com/spreadsheets/d/11c9Yw9FdfLnfbIWqvUztCt-QICW5790dfFGgXH7IB1k/gviz/tq?tq=select%20A%2C%20B%2C%20C&tqx=out:json";

export type Dedications = Record<string, { en?: string; he?: string }>;

/** The old dedDate: the local date 6 hours from now, as YYYY-MM-DD. */
export function dedicationDate(now: Date): string {
  const d = new Date(now.getTime() + 6 * 3_600_000);
  const y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

type Cell = { v?: unknown; f?: string } | null;
/** The gviz answer (`/*O_o*\/ google.visualization.Query.setResponse({...});`) → date → texts, by the formatted values as the old code. */
export function parseDedications(body: string): Dedications {
  const start = body.indexOf("{"), end = body.lastIndexOf("}");
  if (start < 0 || end < start) return {};
  const json = JSON.parse(body.slice(start, end + 1)) as { table?: { rows?: { c?: Cell[] }[] } };
  const out: Dedications = {};
  const text = (c: Cell | undefined) => (c ? (c.f ?? (typeof c.v === "string" ? c.v : undefined)) || undefined : undefined);
  for (const row of json.table?.rows ?? []) {
    const date = text(row.c?.[0]);
    if (date) out[date] = { en: text(row.c?.[1]), he: text(row.c?.[2]) };
  }
  return out;
}

export const dedicationsQuery = () =>
  queryOptions({
    queryKey: ["library", "dedications"] as const,
    queryFn: async ({ signal }): Promise<Dedications> => {
      const r = await fetch(DEDICATION_SHEET, { signal });
      if (!r.ok) return {};
      return parseDedications(await r.text());
    },
    staleTime: 60 * 60_000,
    retry: false,
  });
