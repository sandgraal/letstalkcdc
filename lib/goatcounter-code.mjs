// Validation for the GoatCounter site code (src/_data/analytics.mjs). Visit
// counting is off unless GOATCOUNTER_CODE is set at build
// time. The code is the subdomain of the maintainer's GoatCounter site
// (https://<code>.goatcounter.com). It ends up inside markup, so only a
// valid hostname label is accepted: lowercase letters, digits and hyphens,
// not starting or ending with a hyphen. Anything else is treated as unset.
export const GOATCOUNTER_CODE_PATTERN =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export const readGoatcounterCode = (raw) => {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value || value === "undefined") {
    return "";
  }
  if (!GOATCOUNTER_CODE_PATTERN.test(value)) {
    console.warn(
      "GOATCOUNTER_CODE is not a valid GoatCounter site code (lowercase letters, digits and hyphens only); analytics stays off.",
    );
    return "";
  }
  return value;
};
