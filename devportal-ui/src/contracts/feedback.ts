// Contract C3, the feedback widget ("Did this page help you?"). Mirrors feedback-request.schema.json and
// feedback-response.schema.json. POST /_portal/feedback, JSON body, `X-CSRFToken` header from GET /_portal/csrf.
// 201 → FeedbackResponse; 400 invalid_request, 403 (CSRF), 429 rate_limited → ErrorResponse.
import type { PortalPath } from './common';

export interface FeedbackRequest {
  /** The page's path; the server resolves `Feedback.page` from it. */
  path: PortalPath;
  helpful: boolean;
  /** "Leave an optional comment…". Empty string when the visitor wrote nothing. At most 2000 characters. */
  comment: string;
}

export interface FeedbackResponse {
  ok: true;
}
