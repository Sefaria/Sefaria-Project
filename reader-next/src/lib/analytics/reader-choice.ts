/**
 * Events of the new reader's own controls for the opt-in (LAUNCH_PLAN T-D05): the only new event names this client adds, allowed
 * because the controls are new. `source` says which menu ("account_menu" | "mobile_menu"). Sent with transport beacon: "back to
 * classic" reloads the page right after.
 *
 * @feature ACC-003 Account settings page (the reader choice, T-D05)
 */
import { gtagEvent } from "./core";

export type ReaderChoiceSource = "account_menu" | "mobile_menu";

export const readerChoiceAnalytics = {
  backToClassic: (source: ReaderChoiceSource) => gtagEvent("reader_back_to_classic", { source, transport_type: "beacon" }),
  reportProblem: (source: ReaderChoiceSource) => gtagEvent("reader_report_problem", { source }),
};
