import { useState, useEffect, useRef } from "react";
import Sefaria from "../sefaria/sefaria";
import { fetchUserSubscriptions, getNewsletterLists } from "./newsletterApi";

function detectAuthState(sefaria) {
  const isLoggedIn = !!sefaria._uid;
  return { isLoggedIn, userEmail: isLoggedIn ? sefaria._email : null };
}

function mapNewsletterListsResponse(response) {
  return (response.newsletters ?? []).map((nl) => ({
    key: nl.stringid,
    displayName: nl.displayName,
    icon: nl.icon,
  }));
}

function buildFormDataFromSubscriptionResponse(response) {
  const selectedNewsletters = Object.fromEntries(response.subscribedNewsletters.map((key) => [key, true]));
  // Active managed subscriptions imply marketing emails are enabled;
  // guard against stale or mocked opt-out flags saying otherwise.
  const wantsMarketingEmails = (response.wantsMarketingEmails ?? true) || response.subscribedNewsletters.length > 0;
  return {
    selectedNewsletters,
    wantsMarketingEmails,
    learningLevel: response.learningLevel ?? null,
  };
}

/**
 * useNewsletterFormInit — owns the form's initial-load lifecycle.
 *
 * Responsibilities:
 *  - detect auth state synchronously at first render (no flicker)
 *  - fetch newsletter lists; if logged-in, also fetch the user's existing subscriptions
 *  - record baseline subscription state in a ref for later diff computation
 *  - expose loading + service-unavailable flags so the caller can gate rendering
 *
 * The caller is responsible for merging `initialSubscriptionData` into form
 * state once it arrives — the hook only owns the loaded data, not the form.
 */
export function useNewsletterFormInit() {
  const [authState] = useState(() => detectAuthState(Sefaria));
  const [newsletters, setNewsletters] = useState([]);
  const [newslettersLoading, setNewslettersLoading] = useState(true);
  const [serviceUnavailable, setServiceUnavailable] = useState(false);
  const [initialSubscriptionData, setInitialSubscriptionData] = useState(null);

  // Baseline snapshot of subscriptions + marketing preference at load time.
  // Used downstream to detect what changed and skip a no-op API call.
  const baselineRef = useRef({ subscriptions: {}, wantsMarketing: true });

  useEffect(() => {
    let isMounted = true;

    // Both fetches run in parallel; each catches internally so Promise.all
    // never rejects — the loader always clears even on partial failure.
    const promises = [
      getNewsletterLists()
        .then((response) => {
          if (!isMounted) return;
          if (response.newsletters) {
            setNewsletters(mapNewsletterListsResponse(response));
          }
        })
        .catch((error) => {
          console.error("Failed to fetch newsletter lists:", error);
          if (!isMounted) return;
          setServiceUnavailable(true);
        }),
    ];

    if (authState.isLoggedIn) {
      promises.push(
        fetchUserSubscriptions()
          .then((response) => {
            if (!isMounted) return;
            if (response.success && response.subscribedNewsletters) {
              const data = buildFormDataFromSubscriptionResponse(response);
              baselineRef.current = {
                subscriptions: { ...data.selectedNewsletters },
                wantsMarketing: data.wantsMarketingEmails,
              };
              setInitialSubscriptionData(data);
            }
          })
          .catch((error) => {
            console.error("Failed to fetch user subscriptions:", error);
          }),
      );
    }

    Promise.all(promises).finally(() => {
      if (isMounted) setNewslettersLoading(false);
    });

    return () => {
      isMounted = false;
    };
  }, []);

  return {
    authState,
    newsletters,
    newslettersLoading,
    serviceUnavailable,
    initialSubscriptionData,
    baselineRef,
  };
}
