/**
 * What the sidebar says while its data is slow or failed. A cold `/api/related` can take
 * 15 seconds and end in a 504, and a cold `/api/links` 11: the reader must never be left with a spinner that says nothing. After a
 * few seconds the wait says so; a failure says what is missing and offers to try again. What did arrive stays on screen.
 */
import { useEffect, useState } from "react";
import { Button } from "~/ui/Button/Button";
import { EmptyState, ErrorState, LoadingState } from "~/ui/Feedback/Feedback";
import { InterfaceText } from "~/ui/InterfaceText/InterfaceText";
import styles from "./LoadStatus.module.css";

/** After this long, a load in progress says it is still going. */
export const SLOW_AFTER_MS = 3_000;

/** True once `active` has been true for `ms` without a break. */
export function useSlow(active: boolean, ms = SLOW_AFTER_MS): boolean {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!active) return setSlow(false);
    const t = setTimeout(() => setSlow(true), ms);
    return () => clearTimeout(t);
  }, [active, ms]);
  return slow;
}

interface QueryLike {
  isPending: boolean;
  isFetching: boolean;
  isError: boolean;
  refetch: () => unknown;
}

const retryButton = (q: QueryLike) => (
  <Button size="sm" onClick={() => void q.refetch()} data-testid="sidebar-retry">
    <InterfaceText en="Try again" he="ניסיון נוסף" />
  </Button>
);

/** In place of a whole view: loading (saying so when slow), or failed with a retry. Renders nothing once there is data. */
export function ViewLoad({ q, what }: { q: QueryLike; what: { en: string; he: string } }) {
  const loading = (q.isPending || q.isError) && q.isFetching; // a retry after a failure is loading again
  const slow = useSlow(loading);
  // pending but not fetching: paused (offline) or not started; a message and a retry, never a spinner that waits for nothing
  if (q.isPending && !q.isFetching && !q.isError) {
    return (
      <EmptyState title={<InterfaceText en={`${what.en[0]!.toUpperCase()}${what.en.slice(1)} not loaded yet`} he={`${what.he} עדיין לא נטענו`} />} action={retryButton(q)}>
        <span data-testid="sidebar-not-loaded">
          <InterfaceText en="Check your connection and try again." he="בדקו את החיבור ונסו שוב." />
        </span>
      </EmptyState>
    );
  }
  if (loading) {
    return (
      <LoadingState>
        {slow ? (
          <p role="status" data-testid="sidebar-still-loading">
            <InterfaceText en={`Still loading ${what.en}…`} he={`עדיין טוען ${what.he}…`} />
          </p>
        ) : undefined}
      </LoadingState>
    );
  }
  if (q.isError) {
    return (
      <ErrorState title={<InterfaceText en={`Couldn't load ${what.en}`} he={`לא ניתן לטעון ${what.he}`} />} action={retryButton(q)}>
        <InterfaceText en="The server took too long to answer." he="השרת לא ענה בזמן." />
      </ErrorState>
    );
  }
  return null;
}

/** Under a view that shows what it has: a line while the rest is slow, or what failed with a retry. */
export function PartLoad({ q, what }: { q: QueryLike; what: { en: string; he: string } }) {
  const slow = useSlow((q.isPending || q.isError) && q.isFetching);
  if (q.isError && !q.isFetching) {
    return (
      <div role="alert" data-testid="sidebar-part-failed" className={styles.part}>
        <InterfaceText en={`Couldn't load ${what.en}.`} he={`לא ניתן לטעון ${what.he}.`} />
        {retryButton(q)}
      </div>
    );
  }
  if (slow) {
    return (
      <p role="status" data-testid="sidebar-still-loading" className={styles.part}>
        <InterfaceText en={`Still loading ${what.en}…`} he={`עדיין טוען ${what.he}…`} />
      </p>
    );
  }
  return null;
}
