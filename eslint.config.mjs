import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const previewImport = {
  group: ["@/preview", "@/preview/*", "**/preview/**"],
  message:
    "Development preview code may only be imported from src/preview or src/app/preview (docs/TECHNICAL_ARCHITECTURE.md §20).",
};

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "node_modules/**",
    "playwright-report/**",
    "test-results/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // Extracted document text is untrusted: never render raw HTML.
      "react/no-danger": "error",
      "no-restricted-imports": ["error", { patterns: [previewImport] }],
    },
  },
  {
    // Domain layer: pure TypeScript, no framework, UI or preview imports.
    files: ["src/domain/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            previewImport,
            {
              group: ["react", "react-dom", "next", "next/*"],
              message: "The domain layer must not import frameworks.",
            },
            {
              group: ["@/components/*", "@/app/*"],
              message: "The domain layer must not import UI code.",
            },
          ],
        },
      ],
    },
  },
  {
    // The preview itself may import preview code, but must never persist
    // anything or request business data over the network.
    files: ["src/preview/**/*.{ts,tsx}", "src/app/preview/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": "off",
      "no-restricted-globals": [
        "error",
        { name: "localStorage", message: "The preview must not persist data." },
        { name: "sessionStorage", message: "The preview must not persist data." },
        { name: "indexedDB", message: "The preview must not persist data." },
        { name: "fetch", message: "The preview must not make network requests." },
        { name: "XMLHttpRequest", message: "The preview must not make network requests." },
      ],
      "no-restricted-properties": [
        "error",
        { object: "document", property: "cookie", message: "The preview must not persist data." },
        {
          object: "window",
          property: "fetch",
          message: "The preview must not make network requests.",
        },
        {
          object: "window",
          property: "localStorage",
          message: "The preview must not persist data.",
        },
      ],
    },
  },
  {
    files: ["tests/**/*.{ts,tsx}"],
    rules: { "no-restricted-imports": "off" },
  },
]);
