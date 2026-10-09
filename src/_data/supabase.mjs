const readEnv = (key) => {
  const value = process.env[key];
  if (!value || value === "undefined") {
    return "";
  }
  return value;
};

export default {
  url: readEnv("SUPABASE_URL"),
  publishableKey: readEnv("SUPABASE_PUBLISHABLE_KEY"),
};
