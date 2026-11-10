import { useQuery } from "@tanstack/react-query";
import { useState, type MouseEvent } from "react";
import { useViewer } from "~/features/auth/viewer";
import { gtagEvent } from "~/lib/analytics";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import { pickRecentlyViewed, recentlyViewedQuery } from "~/lib/library/recently-viewed";
import { passageHref } from "~/lib/user/user-history-page";
import { RecentlyViewed, type RecentlyViewedItem } from "~/ui/NavSidebar/NavSidebar";
import { SignUpModal } from "~/ui/SignUpModal/SignUpModal";

/**
 * Recently Viewed on the library home, with the old module's behaviour: an item is a link to the passage with its versions; "All
 * history" goes to /history signed in and opens the sign-up modal ("view history") signed out; both send the old `recently_viewed`
 * gtag events. `phone`: the band above the categories (rendered with the page; CSS shows one or the other).
 *
 * @feature LIB-025 Sidebar module: Recently viewed
 * @feature LIB-004 Mobile library home extras
 */
export function RecentlyViewedModule({ phone }: { phone?: boolean }) {
  const viewer = useViewer();
  const he = useInterfaceLang() === "hebrew";
  const data = useQuery(recentlyViewedQuery(viewer?.id ?? null)).data;
  const [asked, setAsked] = useState(false);
  const picked = pickRecentlyViewed(data ?? []);
  const refOf = new Map(picked.map((x) => [passageHref(x), x.ref]));
  const items: RecentlyViewedItem[] = picked.map((x) => ({
    label: he && x.he_ref ? x.he_ref : x.ref,
    lang: he && x.he_ref ? "he" : "en",
    href: passageHref(x),
  }));
  const onAllHistory = (e: MouseEvent<HTMLAnchorElement>) => {
    if (!viewer) {
      e.preventDefault();
      setAsked(true);
    }
    gtagEvent("recently_viewed", { link_type: "all_history", logged_in: !!viewer });
  };
  return (
    <>
      <RecentlyViewed items={items} hasHistory={(data?.length ?? 0) > 0} phone={phone} onAllHistory={onAllHistory} onItem={(x) => gtagEvent("recently_viewed", { link_text: refOf.get(x.href), link_type: "ref" })} />
      {asked ? <SignUpModal kind="view-history" onClose={() => setAsked(false)} next={typeof window === "undefined" ? "/texts" : window.location.href} /> : null}
    </>
  );
}
