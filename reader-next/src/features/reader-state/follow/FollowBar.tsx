/**
 * The follow bar (docs/READER_STATE_API.md, "Connection states"): a small fixed pill under the header that says where this tab stands in a
 * follow session, the one control that matters in that state, and the faces of who is here.
 *
 * It reads the session client directly (useSyncExternalStore over getState), so it is exactly as current as the client; what the client
 * cannot know — each participant's address, from their stream — comes in as `locations` from the controller.
 */
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { initials } from "~/lib/auth/session";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import type { PresentParticipant, SessionClient, SessionState } from "~/lib/session/client";
import type { ParticipantId } from "~/lib/session/protocol";
import { InterfaceText } from "~/ui/InterfaceText/InterfaceText";
import { Popover } from "~/ui/Popover/Popover";
import { Spinner } from "~/ui/Spinner/Spinner";
import { locationLabel } from "./params";
import styles from "./FollowBar.module.css";

export interface FollowBarProps {
  /** The session; null with `lost` shows that the room could not be reached again. */
  client: SessionClient | null;
  /** Each participant's latest address (pathname + search), for "… is reading Exodus 3". */
  locations?: Readonly<Record<ParticipantId, string>>;
  lost?: boolean;
  /** Stop following (leave the session; the reader stays where it is). */
  onLeave: () => void;
  /** The leader's Stop sharing: end the session for everyone. */
  onEndSharing: () => void;
  /** Close the bar after the session ended or was lost. */
  onDismiss: () => void;
}

/** How long "Now following Reader Two" stays before the bar goes back to the steady state. */
export const NOTICE_MS = 3_000;
/** Faces shown before "+N". */
const MAX_FACES = 6;

const noClient = () => () => {};
const nullState = () => null;

export function FollowBar({ client, locations = {}, lost = false, onLeave, onEndSharing, onDismiss }: FollowBarProps) {
  const state = useSyncExternalStore(client ? client.subscribe : noClient, client ? client.getState : nullState, client ? client.getState : nullState);
  const notice = useSpotlightNotice(state);
  const hebrew = useInterfaceLang() === "hebrew";

  if (!state) {
    if (!lost) return null;
    return (
      <div className={styles.bar} data-reader-state-ui="" role="region" aria-label={hebrew ? "מעקב" : "Follow"}>
        <span className={styles.message} role="status">
          <InterfaceText en="The follow session is not available" he="מפגש המעקב אינו זמין" />
        </span>
        <button type="button" className={styles.action} onClick={onDismiss}>
          <InterfaceText en="Close" he="סגירה" />
        </button>
      </div>
    );
  }

  const nameOf = (id: ParticipantId | null) => displayName(state.participants, id, hebrew);
  // The host's way out is always Stop sharing, even while following someone they made leader: the session is theirs (and in the
  // in-browser room, their tab is the room), so leaving it would end it for everyone anyway — say so.
  const host = state.self.isHost;
  const stopFollowing = host ? (
    <ActionButton onClick={onEndSharing} en="Stop sharing" he="הפסקת השיתוף" />
  ) : (
    <ActionButton onClick={onLeave} en="Stop following" he="הפסקת המעקב" />
  );
  const leave = host ? stopFollowing : <ActionButton onClick={onLeave} en="Leave" he="יציאה" />;
  const followed = nameOf(state.following);
  // Who ended it: the host (only the host can end a session), whoever held the spotlight at the time.
  const sharer = nameOf(state.participants.find((p) => p.isHost)?.id ?? state.room.spotlight);

  let message: ReactNode;
  let action: ReactNode = null;
  let busy = false;
  switch (state.status) {
    case "connecting":
      message = <InterfaceText en="Joining…" he="מצטרפים…" />;
      busy = true;
      action = <ActionButton onClick={onLeave} en="Cancel" he="ביטול" />;
      break;
    case "reconnecting":
      message = <InterfaceText en="Reconnecting…" he="מתחברים מחדש…" />;
      busy = true;
      action = stopFollowing;
      break;
    case "live":
      message = <InterfaceText en={`Following ${followed}`} he={`עוקבים אחרי ${followed}`} />;
      action = stopFollowing;
      break;
    case "paused": {
      const where = locationLabel(state.following ? locations[state.following] : null);
      message = where ? (
        <InterfaceText en={`${followed} is reading ${where}`} he={`${followed} קורא/ת ${where}`} />
      ) : (
        <InterfaceText en={`You stopped following ${followed}`} he={`הפסקת לעקוב אחרי ${followed}`} />
      );
      action = (
        <>
          <ActionButton onClick={() => client!.followAgain()} en="Follow again" he="חזרה למעקב" primary />
          {leave}
        </>
      );
      break;
    }
    case "leader-away":
      message = <InterfaceText en={`Waiting for ${followed} to come back`} he={`ממתינים לחזרה של ${followed}`} />;
      action = stopFollowing;
      break;
    case "no-leader":
      message = <InterfaceText en="Waiting for a leader" he="ממתינים למוביל/ה" />;
      action = leave;
      break;
    case "ended":
      message = <InterfaceText en={`${sharer} stopped sharing`} he={`${sharer} הפסיק/ה לשתף`} />;
      action = <ActionButton onClick={onDismiss} en="Close" he="סגירה" />;
      break;
    case "leading": {
      const count = state.participants.filter((p) => p.id !== state.self.id && p.following === state.self.id).length;
      message = <InterfaceText en={`Sharing · ${count} following`} he={`משתפים · ${count} עוקבים`} />;
      action = leave;
      break;
    }
  }

  return (
    <div className={styles.bar} data-reader-state-ui="" role="region" aria-label={hebrew ? "מעקב" : "Follow"} data-status={state.status}>
      {busy ? <Spinner size="0.875rem" label="" /> : null}
      <span className={styles.message} role="status">
        {notice ?? message}
      </span>
      {state.status !== "ended" && state.participants.length > 0 ? <Faces state={state} client={client!} hebrew={hebrew} /> : null}
      <span className={styles.actions}>{action}</span>
    </div>
  );
}

function ActionButton({ onClick, en, he, primary }: { onClick: () => void; en: string; he: string; primary?: boolean }) {
  return (
    <button type="button" className={primary ? `${styles.action} ${styles.primary}` : styles.action} onClick={onClick}>
      <InterfaceText en={en} he={he} />
    </button>
  );
}

function displayName(participants: PresentParticipant[], id: ParticipantId | null, hebrew: boolean): string {
  const name = id ? participants.find((p) => p.id === id)?.name?.trim() : undefined;
  return name || (hebrew ? "המוביל/ה" : "the leader");
}

/**
 * "Now following Reader Two" for a moment when whom this tab follows changes from one person to another (the spotlight moved, or a face was
 * picked), and "You are leading" when the spotlight comes to this tab. Compared across states by `following`, the spotlight and its term.
 */
function useSpotlightNotice(state: SessionState | null): ReactNode {
  const prev = useRef<{ following: ParticipantId | null; spotlight: ParticipantId | null; term: number; status: SessionState["status"] } | null>(null);
  const [notice, setNotice] = useState<{ en: string; he: string } | null>(null);
  const following = state?.following ?? null;
  const spotlight = state?.room.spotlight ?? null;
  const term = state?.room.term ?? 0;
  const status = state?.status ?? "ended";
  const name = state ? state.participants.find((p) => p.id === following)?.name?.trim() : undefined;

  useEffect(() => {
    const before = prev.current;
    prev.current = { following, spotlight, term, status };
    if (!before) return;
    const settled = (s: SessionState["status"]) => s !== "connecting" && s !== "reconnecting";
    if (!settled(before.status) || !settled(status)) return;
    if (status === "leading" && before.status !== "leading" && term !== before.term) {
      setNotice({ en: "You are leading", he: "את/ה מוביל/ה" });
    } else if (following && before.following && following !== before.following && (status === "live" || status === "leader-away")) {
      const n = name || "the leader";
      setNotice({ en: `Now following ${n}`, he: `עכשיו עוקבים אחרי ${name || "המוביל/ה"}` });
    }
  }, [following, spotlight, term, status, name]);

  // The dismissal has its own effect, keyed on the notice: a state change in the next few seconds that starts no new notice (the
  // follower scrolls away) must not cancel the timer and leave the notice up for good.
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  return notice ? <InterfaceText en={notice.en} he={notice.he} /> : null;
}

// ── Presence ──────────────────────────────────────────────────────────────────────────────────────────────────

function Faces({ state, client, hebrew }: { state: SessionState; client: SessionClient; hebrew: boolean }) {
  const shown = state.participants.slice(0, MAX_FACES);
  const more = state.participants.length - shown.length;
  return (
    <ul className={styles.faces} aria-label={hebrew ? "משתתפים" : "Participants"}>
      {shown.map((p) => (
        <li key={p.id}>
          <Face p={p} state={state} client={client} hebrew={hebrew} />
        </li>
      ))}
      {more > 0 ? <li className={styles.more}>+{more}</li> : null}
    </ul>
  );
}

function Face({ p, state, client, hebrew }: { p: PresentParticipant; state: SessionState; client: SessionClient; hebrew: boolean }) {
  const [open, setOpen] = useState(false);
  const self = p.id === state.self.id;
  const leading = state.room.spotlight === p.id;
  const followedHere = state.following === p.id && (state.status === "live" || state.status === "leader-away");
  const name = p.name?.trim() || (hebrew ? "משתתף/ת" : "Participant");
  const whom = p.following ? state.participants.find((x) => x.id === p.following)?.name?.trim() : undefined;

  // Who this is, as one phrase: for the tooltip and for screen readers.
  const parts = [self ? (hebrew ? `${name} (את/ה)` : `${name} (you)`) : name];
  if (leading) parts.push(hebrew ? "מוביל/ה" : "leading");
  if (whom) parts.push(hebrew ? `עוקב/ת אחרי ${whom}` : `following ${whom}`);
  if (p.away) parts.push(hebrew ? "לא פעיל/ה" : "away");
  const description = parts.join(" · ");

  const className = [styles.face, leading ? styles.leading : "", followedHere ? styles.followed : "", p.away ? styles.away : ""].filter(Boolean).join(" ");
  const badge = leading ? <span className={styles.badge} aria-hidden="true" /> : null;
  const letters = <span aria-hidden="true">{initials(name).toUpperCase()}</span>;

  // The host may hand the spotlight to anyone (themself included, to take it back); everyone else follows by clicking.
  if (state.self.isHost && !(self && leading)) {
    return (
      <Popover
        open={open}
        onOpenChange={setOpen}
        label={description}
        align="start"
        trigger={(t) => (
          <button {...t} type="button" className={className} title={description} aria-label={description}>
            {letters}
            {badge}
          </button>
        )}
      >
        <div className={styles.menu} data-reader-state-ui="" role="menu" aria-label={description}>
          {!self ? (
            <button type="button" role="menuitem" className={styles.menuItem} onClick={() => (setOpen(false), client.follow(p.id))}>
              <InterfaceText en={`Follow ${name}`} he={`מעקב אחרי ${name}`} />
            </button>
          ) : null}
          {!leading ? (
            <button type="button" role="menuitem" className={styles.menuItem} onClick={() => (setOpen(false), client.spotlight(p.id))}>
              <InterfaceText en={self ? "Lead again" : "Make leader"} he={self ? "חזרה להובלה" : "הפיכה למוביל/ה"} />
            </button>
          ) : null}
        </div>
      </Popover>
    );
  }

  if (self) {
    return (
      <span className={className} title={description} role="img" aria-label={description}>
        {letters}
        {badge}
      </span>
    );
  }

  return (
    <button
      type="button"
      className={className}
      title={description}
      aria-label={hebrew ? `מעקב אחרי ${description}` : `Follow ${description}`}
      aria-pressed={followedHere}
      onClick={() => client.follow(p.id)}
    >
      {letters}
      {badge}
    </button>
  );
}
