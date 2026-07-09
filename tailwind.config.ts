import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/app/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Warm & radiant identity — "light of Christ" dawn palette
        midnight: {
          DEFAULT: "#12224E",
          50: "#EAEEF7",
          100: "#C9D3EC",
          800: "#101E44",
          900: "#0C1636",
          950: "#070E24",
        },
        royal: {
          DEFAULT: "#1E40AF",
          400: "#5B7FE0",
          500: "#3B6FE0",
          600: "#2A54C4",
          700: "#1E40AF",
          800: "#1A357F",
        },
        gold: {
          DEFAULT: "#F5B942",
          200: "#FCE8B8",
          300: "#FCD980",
          400: "#F8C95C",
          500: "#F5B942",
          600: "#E09E1F",
        },
        cream: {
          DEFAULT: "#FBF8F1",
          100: "#FDFBF6",
          200: "#F4EEE0",
        },
      },
      fontFamily: {
        display: ["var(--font-fraunces)", "Georgia", "serif"],
        sans: ["var(--font-jakarta)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        soft: "0 10px 40px -12px rgba(18, 34, 78, 0.18)",
        glow: "0 0 60px -10px rgba(245, 185, 66, 0.45)",
        card: "0 8px 30px -10px rgba(18, 34, 78, 0.15)",
      },
      backgroundImage: {
        "dawn": "linear-gradient(135deg, #1E40AF 0%, #3B6FE0 45%, #F5B942 100%)",
        "dawn-soft": "linear-gradient(135deg, #1E40AF 0%, #2A54C4 60%, #E09E1F 120%)",
        "radiant": "radial-gradient(circle at 50% 30%, rgba(252,217,128,0.35), transparent 60%)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(24px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "float": {
          "0%,100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
        "shimmer": {
          "100%": { transform: "translateX(100%)" },
        },
        "spin-slow": {
          "100%": { transform: "rotate(360deg)" },
        },
        "pulse-glow": {
          "0%,100%": { opacity: "0.5" },
          "50%": { opacity: "1" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.7s cubic-bezier(0.22,1,0.36,1) both",
        "float": "float 6s ease-in-out infinite",
        "shimmer": "shimmer 2s infinite",
        "spin-slow": "spin-slow 40s linear infinite",
        "pulse-glow": "pulse-glow 4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
