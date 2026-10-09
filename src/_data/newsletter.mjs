import { resolveNewsletter } from "../../lib/newsletter.mjs";

// Read like SUPABASE_URL (src/_data/supabase.mjs): a repository variable
// exposed to the build, unset by default. See docs/SETUP.md, "Newsletter".
export default resolveNewsletter(process.env.BUTTONDOWN_USERNAME);
