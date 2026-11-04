import { useQuery } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";
import { useViewer } from "~/features/auth/viewer";
import { uaEvent } from "~/lib/analytics";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import { calendarListings, calendarsQueryOptions, sectionListings } from "~/lib/library/calendars";
import { isValidEmailAddress, subscribeNewsletter } from "~/lib/user/newsletter";
import { CalendarsPage } from "~/ui/CalendarsPage/CalendarsPage";
import { LoadingState } from "~/ui/Feedback/Feedback";
import { AboutLearningSchedules, PromoSlot, SidebarFooter, StayConnected, SupportSefaria } from "~/ui/NavSidebar/NavSidebar";
import { NewsletterSignUp, type NewsletterSubscription } from "~/ui/NewsletterSignUp/NewsletterSignUp";
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
export function CalendarsRoute() {
  const { diaspora } = useRouteContext({ from: "__root__" });
  const viewer = useViewer();
  const custom = useQuery(textualCustomQuery(viewer?.profileUrl)).data;
  const items = useQuery({ ...calendarsQueryOptions(diaspora, custom ?? undefined), enabled: !!custom }).data;
  const listings = useMemo(() => (items ? calendarListings(items) : undefined), [items]);
  const lang = useInterfaceLang();
  const subscribe = useCallback((s: NewsletterSubscription) => subscribeNewsletter({ ...s, interfaceLang: lang }), [lang]);
  if (!listings) return <LoadingState />;
  return (
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
  );
}
