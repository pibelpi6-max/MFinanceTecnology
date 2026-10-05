import type { Config } from "tailwindcss";
import { BRAND } from "./src/config/brand";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: BRAND.primary,
          hover:   BRAND.primaryHover,
          light:   BRAND.primaryLight,
          glow:    BRAND.primaryGlow,
          border:  BRAND.primaryBorder,
        },
      },
      ringColor: {
        primary: BRAND.primary,
      },
      borderColor: {
        primary: BRAND.primary,
      },
      fontFamily: {
        display: ["Syne", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
