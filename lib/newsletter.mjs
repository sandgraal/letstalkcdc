/**
 * Newsletter configuration (P15-9): the single place that turns the
 * BUTTONDOWN_USERNAME build variable into a form action.
 *
 * The signup is off until the variable is set to a valid username: while it
 * is unset (or invalid) no form, footer link or sitemap entry is rendered
 * and /newsletter/ says the newsletter is not open yet.
 *
 * Endpoint and field names are from Buttondown's documentation
 * (https://docs.buttondown.com/building-your-subscriber-base, "Embedding an
 * HTML form"): a standard HTML form POSTs `email` and a hidden `embed=1` to
 * the embed-subscribe endpoint. Buttondown asks that it be a real form
 * navigation, not fetch(), because subscribers may need to complete a
 * CAPTCHA on Buttondown's response page.
 */

export const BUTTONDOWN_EMBED_ENDPOINT =
  "https://buttondown.com/api/emails/embed-subscribe/";
export const BUTTONDOWN_PRIVACY_URL = "https://buttondown.com/legal/privacy";

// The only characters allowed in a username. The value ends up in an HTML
// attribute and a URL path, so anything else is rejected rather than escaped.
const USERNAME_PATTERN = /^[A-Za-z0-9_-]+$/;

const DISABLED = Object.freeze({
  enabled: false,
  username: "",
  action: "",
  privacyUrl: BUTTONDOWN_PRIVACY_URL,
});

/**
 * @param {string | undefined} raw  the BUTTONDOWN_USERNAME value
 * @param {(message: string) => void} [warn]
 */
export function resolveNewsletter(raw, warn = console.warn) {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value || value === "undefined") return DISABLED;

  if (!USERNAME_PATTERN.test(value)) {
    // The value is deliberately not echoed: it is untrusted input.
    warn(
      "[newsletter] BUTTONDOWN_USERNAME contains characters other than " +
        "letters, digits, '-' and '_'; the newsletter signup stays off.",
    );
    return DISABLED;
  }

  return {
    enabled: true,
    username: value,
    action: `${BUTTONDOWN_EMBED_ENDPOINT}${value}`,
    privacyUrl: BUTTONDOWN_PRIVACY_URL,
  };
}
