import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { dedicationDate, dedicationsQuery } from "~/lib/library/dedication";
import { Dedication } from "~/ui/LibraryHome/LibraryHome";

/**
 * Today's dedication on the library home, as the old page: asked of the sheet in the browser after load (the day is the reader's local
 * one), shown only when the day has text.
 * @feature LIB-005 Daily dedication banner
 */
export function DedicationBanner() {
  const [date, setDate] = useState<string>();
  useEffect(() => setDate(dedicationDate(new Date())), []);
  const all = useQuery({ ...dedicationsQuery(), enabled: !!date }).data;
  const text = date ? all?.[date] : undefined;
  return text && (text.en || text.he) ? <Dedication text={text} /> : null;
}
