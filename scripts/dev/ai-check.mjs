// Checks the Gemini settings in .env.local without spending quota: it asks
// Google for the configured model's details (a free metadata call, no
// document is sent). The API key is never printed.
// Usage: corepack pnpm ai:check
import { existsSync, readFileSync } from "node:fs";

const file = new URL("../../.env.local", import.meta.url);
const env = {};
if (existsSync(file)) {
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}
const read = (name, fallback) => process.env[name] ?? env[name] ?? fallback;

const provider = read("AI_EXTRACTION_PROVIDER", "simulated");
const key = read("GEMINI_API_KEY", "");
const model = read("GEMINI_MODEL", "gemini-3.8-flash");
const base = read("GEMINI_BASE_URL", "https://generativelanguage.googleapis.com").replace(
  /\/$/,
  "",
);

console.log(`AI_EXTRACTION_PROVIDER: ${provider}`);
console.log(`GEMINI_MODEL:           ${model}`);
console.log(
  `GEMINI_API_KEY:         ${key ? `set (${key.length} characters, not shown)` : "not set"}`,
);

if (!key) {
  console.log("\nAdd GEMINI_API_KEY=... to .env.local (see README → Real AI extraction).");
  process.exit(1);
}

let response;
try {
  response = await fetch(`${base}/v1beta/models/${encodeURIComponent(model)}`, {
    headers: { "x-goog-api-key": key },
    signal: AbortSignal.timeout(15_000),
  });
} catch (error) {
  console.log(`\nCould not reach Google (${error.name}). Check your internet connection.`);
  process.exit(1);
}

if (response.ok) {
  const info = await response.json();
  const methods = info.supportedGenerationMethods ?? [];
  console.log(`\nOK: the key works and ${info.name ?? model} is available.`);
  if (methods.length && !methods.includes("generateContent"))
    console.log("Warning: this model does not support generateContent.");
  if (provider !== "gemini")
    console.log("Note: set AI_EXTRACTION_PROVIDER=gemini to use it, then restart the app.");
  process.exit(0);
}

const reasons = {
  400: "the API key is not valid",
  401: "the API key is not valid",
  403: "the API key is not allowed to use this API",
  404: `the model "${model}" was not found; check GEMINI_MODEL`,
  429: "the free-tier quota is used up for now; try again later",
};
console.log(
  `\nFailed (HTTP ${response.status}): ${reasons[response.status] ?? "unexpected response from Google"}.`,
);
process.exit(1);
