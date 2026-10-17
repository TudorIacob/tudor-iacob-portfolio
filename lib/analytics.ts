export type AnalyticsEvent =
  | "tai_opened"
  | "conversation_started"
  | "question_submitted"
  | "suggested_question_clicked"
  | "response_generated"
  | "source_clicked"
  | "service_cta_clicked"
  | "contact_cta_clicked";
// Optional listeners receive event names only, never questions or personal information.
export function track(event: AnalyticsEvent) {
  if (typeof window !== "undefined")
    window.dispatchEvent(
      new CustomEvent("portfolio:analytics", { detail: { event } }),
    );
}
