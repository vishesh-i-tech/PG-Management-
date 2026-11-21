import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        serif: ["'Playfair Display'", "Georgia", "serif"],
        sans: ["'Plus Jakarta Sans'", "Inter", "system-ui", "sans-serif"],
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        haven: {
          gold: "#C5A880",
          goldLight: "#E5D5C1",
          goldDark: "#A88455",
          dark: "#070F15",
          cardDark: "#0D1820",
          teal: "#0A1D24",
          cream: "#FAF8F5",
          sand: "#F3EFEA",
        },
      },
    },
  },
  plugins: [],
};

export default config;
