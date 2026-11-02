import next from "eslint-config-next/core-web-vitals";
import ts from "eslint-config-next/typescript";

const config = [
  { ignores: [".next/**", "public/sw.js", "next-env.d.ts"] },
  ...next,
  ...ts,
  { rules: { "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }], "@next/next/no-location-assign-relative-destination": "off" } },
];

export default config;
