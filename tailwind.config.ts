import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

// NOTE: Tailwind CSS 4 reads its theme from the `@theme` directive in
// `src/app/globals.css`. This JS config file is retained only for IDE /
// extension tooling that expects a `tailwind.config.ts` at the project
// root; it is NOT loaded by the build. Keep it minimal and syntactically
// valid so lint passes.
const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [tailwindcssAnimate],
};

export default config;
