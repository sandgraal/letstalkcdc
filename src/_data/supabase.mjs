// Optional assistant-feedback backend (Supabase). Everything here is public
// client-side configuration; access is enforced by row-level security (insert-only
// for anon). Leave unset and feedback stays in the browser's localStorage.
const readEnv = (key) => {
  const value = process.env[key];
  if (!value || value === "undefined") {
    return "";
  }
  return value;
};

export default {
  url: readEnv("SUPABASE_URL"),
  key: readEnv("SUPABASE_PUBLISHABLE_KEY"),
};
