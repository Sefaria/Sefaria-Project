import { useQuery } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { langCode, useInterfaceLang } from "~/lib/i18n/interface-lang";
import { segmentHistoryHref, segmentHistoryQueryOptions, type SegmentHistoryAddress } from "~/lib/activity/segment-history";
import { LoadingState } from "~/ui/Feedback/Feedback";
import { LinkProvider } from "~/ui/Link/Link";
import { RevisionHistory } from "~/ui/RevisionHistory/RevisionHistory";
import { VerbatimRouterLink } from "../shared/RouterLink";

/**
 * `/activity/<ref>/<lang>/<version>[/<page>]?type=`: a text's revision history, in the app (the reader's "Revision History" link,
 * LEG-019). Refs, "others »" and "Older Activity »" open in the app; a profile or a sheet goes to Django's page (not ported yet).
 *
 * @feature LEG-019 Text edit activity feed (/activity): a text's revision history
 */
export function RevisionHistoryRoute({ address, type }: { address: SegmentHistoryAddress; type: string | undefined }) {
  const lang = langCode(useInterfaceLang());
  const router = useRouter();
  const history = useQuery(segmentHistoryQueryOptions(address, type)).data;
  if (!history) return <LoadingState />;
  return (
    <LinkProvider value={VerbatimRouterLink}>
      <RevisionHistory history={history} lang={lang} onFilter={(t) => router.history.push(segmentHistoryHref(history, 1, t || null))} />
    </LinkProvider>
  );
}
