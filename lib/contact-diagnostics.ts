// Only fixed codes reach logs. Provider messages may contain private addresses.
export function contactProviderFailure(error: unknown): string {
  if (!error || typeof error !== "object") return "provider_unavailable";
  const message =
    "message" in error && typeof error.message === "string"
      ? error.message
      : "";
  const name =
    "name" in error && typeof error.name === "string" ? error.name : "";
  if (/only send testing emails/i.test(message))
    return "resend_test_recipient_restricted";
  if (/domain.*not verified/i.test(message))
    return "resend_sender_domain_unverified";
  if (/api key.*invalid|invalid.*api key/i.test(message))
    return "resend_invalid_api_key";
  if (
    [
      "restricted_api_key",
      "suspended_api_key",
      "missing_api_key",
      "invalid_permission",
    ].includes(name)
  )
    return "resend_key_permissions";
  if (
    [
      "daily_quota_exceeded",
      "monthly_quota_exceeded",
      "rate_limit_exceeded",
    ].includes(name)
  )
    return "resend_quota_or_rate_limit";
  if (name === "TimeoutError" || name === "AbortError") return "resend_timeout";
  return "provider_unavailable";
}
