// The feedback endpoint the e2e build and the assistant spec agree on.
//
// The site's CSP connect-src names the Supabase origin the build was given
// (SUPABASE_URL), so a browser blocks fetches to any other host. The e2e
// build therefore has to be made with these exact values, as deploy.yml does
// with the real ones. .github/workflows/ci.yml sets them on the build step;
// tests/unit/csp.test.js fails if the two ever differ.
export const E2E_SUPABASE_URL = "https://feedback-test.supabase.co";
export const E2E_SUPABASE_KEY = "sb_publishable_e2e";
