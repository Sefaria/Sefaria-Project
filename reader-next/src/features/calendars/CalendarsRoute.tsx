import { useQuery } from "@tanstack/react-query";
import { useRouteContext, useRouter } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo } from "react";
import { useViewer } from "~/features/auth/viewer";
import { uaEvent } from "~/lib/analytics";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import { calendarListings, calendarsQueryOptions, sectionListings } from "~/lib/library/calendars";
import { isValidEmailAddress, subscribeNewsletter } from "~/lib/user/newsletter";
import { CalendarsPage } from "~/ui/CalendarsPage/CalendarsPage";
import { LinkProvider } from "~/ui/Link/Link";
import { LoadingState } from "~/ui/Feedback/Feedback";
import { AboutLearningSchedules, PromoSlot, SidebarFooter, StayConnected, SupportSefaria } from "~/ui/NavSidebar/NavSidebar";
import { NewsletterSignUp, type NewsletterSubscription } from "~/ui/NewsletterSignUp/NewsletterSignUp";
import { VerbatimRouterLink } from "../shared/RouterLink";
import { textualCustomQuery } from "./textual-custom";

/**
 * /calendars: the Learning Schedules page, from today's items for this reader (Israel or the diaspora by the request's country, the
 * signed-in reader's textual custom, else "ashkenazi"), as the old page had them from its server.
 *
 * Sidebar as the old page: About Learning Schedules (wide screens; at the top of the page on a phone), Stay Connected, Support Sefaria,
 * the empty Promo slot, the footer.
 *
 * @feature CAL-001 Learning Schedules page
 * @feature LIB-050 Sidebar module: Stay Connected
 * @feature LIB-054 Sidebar module: About learning schedules
 */
/** The tab title the old app set once it had loaded (ReaderApp's getPageTitle("header.learning_schedules")); the server HTML keeps its own. */
const CLIENT_TITLE = { english: "Learning Schedules | The Sefaria Library", hebrew: "לוח לימוד יומי | האוסף של ספריא" } as const;

export function CalendarsRoute() {
  const { diaspora } = useRouteContext({ from: "__root__" });
  const viewer = useViewer();
  const custom = useQuery(textualCustomQuery(viewer?.profileUrl)).data;
  const items = useQuery({ ...calendarsQueryOptions(diaspora, custom ?? undefined), enabled: !!custom }).data;
  const listings = useMemo(() => (items ? calendarListings(items) : undefined), [items]);
  const lang = useInterfaceLang();
  const router = useRouter();
  // As the old app once loaded (ReaderApp's replaceState with hist.url "calendars"): the address becomes /calendars, with no trailing
  // slash and no query (the hash stays). Once, on arrival: while the next page loads this component is still mounted.
  useEffect(() => {
    const { pathname, searchStr, hash } = router.state.location;
    if (pathname !== "/calendars" || searchStr) router.history.replace(`/calendars${hash ? `#${hash}` : ""}`);
  }, [router]);
  useEffect(() => {
    document.title = CLIENT_TITLE[lang === "hebrew" ? "hebrew" : "english"];
  }, [lang]);
  const subscribe = useCallback((s: NewsletterSubscription) => subscribeNewsletter({ ...s, interfaceLang: lang }), [lang]);
  if (!listings) return <LoadingState />;
  return (
    // the cards' hrefs as the old page wrote them (a Hebrew collection name, %20 in a tag), still followed inside the app
    <LinkProvider value={VerbatimRouterLink}>
      <CalendarsPage
        weeklyPortion={sectionListings(listings, "weeklyPortion")}
        daily={sectionListings(listings, "daily")}
        weekly={sectionListings(listings, "weekly")}
        intro={<AboutLearningSchedules phoneOnly />}
        footer={<SidebarFooter />}
        sidebar={
          <>
            <AboutLearningSchedules wideOnly />
            <StayConnected
              newsletter={
                <NewsletterSignUp
                  subscribe={subscribe}
                  isValidEmail={isValidEmailAddress}
                  // the old sidebar passed `context="sidebar"` where the form reads `contextName`: its event says "Subscribe from undefined"
                  onSubscribed={() => uaEvent("Newsletter", "Subscribe from undefined", "")}
                />
              }
            />
            <SupportSefaria />
            <PromoSlot />
          </>
        }
      />
    </LinkProvider>
  );
}
