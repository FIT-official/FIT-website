import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  // Flat config only lints .js by default — opt .jsx in explicitly.
  { files: ["**/*.{js,jsx,mjs}"] },
  { ignores: ["**/.next/", "node_modules/", "coverage/", "**/public/", "archive/"] },
  ...compat.extends("next/core-web-vitals"),
];

export default eslintConfig;
