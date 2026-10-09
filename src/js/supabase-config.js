const globalScope = typeof window !== "undefined" ? window : globalThis;

const supabaseConfig = {
  url: globalScope.SUPABASE_URL ?? "",
  key: globalScope.SUPABASE_PUBLISHABLE_KEY ?? "",
};

export const isBackendConfigured = Boolean(
  supabaseConfig.url && supabaseConfig.key,
);

let client = null;

if (isBackendConfigured) {
  try {
    // Import the SDK from a CDN to avoid bundler configuration.
    const { createClient } =
      await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.58.0/+esm");
    client = createClient(supabaseConfig.url, supabaseConfig.key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  } catch (error) {
    console.error("Failed to initialize Supabase client:", error);
  }
} else {
  console.debug(
    "Supabase configuration missing; assistant feedback will stay local.",
  );
}

export { client };
export const FEEDBACK_TABLE = "assistant_feedback";
export const isBackendReady = Boolean(client);
