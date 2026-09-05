/** Library entry — re-exports for programmatic use. */
export { loadConfig, saveConfig, defaultConfigPath, defaultDataDir } from "./config.js";
export { meaningfulDiff, contentHash } from "./diff.js";
export { classifyChange, summarizeChangeLocally } from "./classify.js";
export { fetchNormalized, assertAllowedUrl, normalizeText } from "./fetch.js";
export { runCheck } from "./check.js";
export { buildDigest } from "./digest.js";
export { Store } from "./store.js";
export type * from "./types.js";
