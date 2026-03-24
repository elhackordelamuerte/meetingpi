import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          base: "#0a0b0d",
          surface: "#111318",
          elevated: "#1a1d24",
        },
        border: {
          DEFAULT: "#2a2d35",
        },
        text: {
          primary: "#e8eaf0",
          secondary: "#8b909e",
          muted: "#4a4f5e",
        },
        accent: {
          red: "#e53935",
          green: "#00c853",
          amber: "#ffab00",
          blue: "#2979ff",
        },
      },
      fontFamily: {
        mono: ["JetBrains Mono", "Menlo", "Monaco", "Consolas", "monospace"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      animation: {
        pulse: "pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
    },
  },
  plugins: [],
};

export default config;
