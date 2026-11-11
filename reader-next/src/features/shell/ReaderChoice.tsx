/**
 * "Back to the classic reader" and "Report a problem", in the account menu and the phone menu while the opt-in exists.
 * `useReaderOptIn` gives the header its two actions (or null: no opt-in, no items) and the feedback dialog to render.
 * "Report a problem" reuses the sidebar's Feedback form (FeedbackView → POST /api/send_feedback), in a dialog.
 *
 * @feature ACC-003 Account settings page (the reader choice, T-D05)
 */
import { useEffect, useState, type ReactNode } from "react";
import { readerAnalytics, readerChoiceAnalytics, type ReaderChoiceSource } from "~/lib/analytics";
import { PUBLIC_CONFIG } from "~/lib/config";
import { sendFeedback } from "~/lib/feedback/feedback";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import { FeedbackView, type FeedbackSubmission } from "~/ui/FeedbackView/FeedbackView";
import { Modal } from "~/ui/Modal/Modal";
import { backToClassic, optedIn } from "./reader-choice";

export interface ReaderOptInActions {
  onBackToClassic: (source: ReaderChoiceSource) => void;
  onReportProblem: (source: ReaderChoiceSource) => void;
}

/** Prefix on the message, so support can tell reports from the new reader apart (Django's feedback mail has no other field for it). */
export const FEEDBACK_PREFIX = "[New reader]";

export function useReaderOptIn(viewer: { id: number } | null): { actions: ReaderOptInActions | null; dialog: ReactNode } {
  const he = useInterfaceLang() === "hebrew";
  // the cookie is read after hydration: the server-rendered header has the menus closed, so nothing differs at first paint
  const [active, setActive] = useState(false);
  useEffect(() => setActive(optedIn(document.cookie)), []);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const actions: ReaderOptInActions | null = active
    ? {
        onBackToClassic: (source) => {
          if (leaving) return;
          setLeaving(true);
          readerChoiceAnalytics.backToClassic(source);
          void backToClassic();
        },
        onReportProblem: (source) => {
          readerChoiceAnalytics.reportProblem(source);
          setFeedbackOpen(true);
        },
      }
    : null;

  const submit = async ({ type, msg, email }: FeedbackSubmission) => {
    const url = window.location.href;
    await sendFeedback({ refs: null, type, url, email, msg: `${FEEDBACK_PREFIX}${PUBLIC_CONFIG.analytics.appVersion ? ` (${PUBLIC_CONFIG.analytics.appVersion})` : ""} ${msg}`, uid: viewer?.id ?? null });
    readerAnalytics.feedbackSent(url);
  };

  const dialog = active ? (
    <Modal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} label={he ? "דיווח על בעיה" : "Report a problem"}>
      {feedbackOpen ? <FeedbackView signedIn={!!viewer} onSubmit={submit} /> : null}
    </Modal>
  ) : null;
  return { actions, dialog };
}
