const readEnv = (key) => {
  const value = process.env[key];
  if (!value || value === "undefined") {
    return "";
  }
  return value;
};

module.exports = {
  endpoint: readEnv("APPWRITE_ENDPOINT"),
  project: readEnv("APPWRITE_PROJECT"),
  databaseId: readEnv("APPWRITE_DB_ID"),
  progressCollectionId: readEnv("COL_PROGRESS_ID"),
  eventsCollectionId: readEnv("COL_EVENTS_ID"),
};
