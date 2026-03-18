import { readFileSync } from "fs";
import { build, context } from "esbuild";

function loadEnv() {
  const defaults = {
    LLM_API_BASE_URL: "https://api.openai.com/v1",
    LLM_API_KEY: "",
    LLM_MODEL: "gpt-4o-mini"
  };

  try {
    const content = readFileSync(".env", "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      const value = trimmed.slice(eqIndex + 1).trim();
      if (key in defaults) {
        defaults[key] = value;
      }
    }
  } catch {
    console.warn("No .env file found, using defaults.");
  }

  return defaults;
}

const env = loadEnv();

const define = {};
for (const [key, value] of Object.entries(env)) {
  define[`process.env.${key}`] = JSON.stringify(value);
}

const shared = {
  bundle: true,
  format: "iife",
  target: "chrome109",
  define,
  logLevel: "info"
};

const isWatch = process.argv.includes("--watch");

if (isWatch) {
  const ctxContent = await context({
    ...shared,
    entryPoints: ["src/content/index.js"],
    outfile: "content.js",
    loader: { ".css": "text" }
  });
  const ctxBackground = await context({
    ...shared,
    entryPoints: ["src/background/index.js"],
    outfile: "background.js"
  });
  await Promise.all([ctxContent.watch(), ctxBackground.watch()]);
  console.log("Watching for changes...");
} else {
  await Promise.all([
    build({
      ...shared,
      entryPoints: ["src/content/index.js"],
      outfile: "content.js",
      loader: { ".css": "text" }
    }),
    build({
      ...shared,
      entryPoints: ["src/background/index.js"],
      outfile: "background.js"
    })
  ]);
}
