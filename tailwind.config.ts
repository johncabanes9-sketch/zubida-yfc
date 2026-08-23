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
          50: "#EAEFFC",
          100: "#DCE5FA",
          300: "#A9BFF3",
          400: "#5B7FE0",
          500: "#3B6FE0",
          600: "#2A54C4",
          700: "#1E40AF",
          800: "#1A357F",
          900: "#16296E",
        },
        gold: {
          DEFAULT: "#F5B942",
          200: "#FCE8B8",
          300: "#FCD980",
          400: "#F8C95C",
          500: "#F5B942",
          600: "#E09E1F",
          // gold-600 measures 2.18:1 on cream — below the 4.5:1 AA floor.
          // Use gold-700 for gold-coloured *text* on any light surface.
          700: "#8A5A06",
        },
        cream: {
          DEFAULT: "#FBF8F1",
          100: "#FDFBF6",
          200: "#F4EEE0",
        },
        // Cool-tinted neutrals, hue-matched to `midnight` so admin chrome
        // (borders, table rules, meta text) sits in the same family as the
        // brand rather than reading as a foreign grey.
        neutral: {
          50: "#F6F7FA",
          100: "#EDEFF5",
          200: "#DDE1EB",
          300: "#B7C0D8",
          400: "#8A95B4",
          500: "#6B7796",
          600: "#525E7D",
          700: "#3D4763",
          800: "#2A3249",
          900: "#1A2035",
        },
        // Semantic rungs. Every `-700` clears 4.5:1 on cream AND white;
        // every `-300` clears 4.5:1 on midnight-950. The `-50` rungs are
        // badge fills, paired with their own `-700` text.
        success: {
          50: "#E3F5EE",
          300: "#6EE7B7",
          500: "#0F9668",
          700: "#0B6E4F",
        },
        warn: {
          50: "#FBF0DC",
          300: "#FCD34D",
          500: "#C87D0F",
          700: "#9A5B08",
        },
        danger: {
          50: "#FDE9E7",
          300: "#FDA29B",
          500: "#D92D20",
          700: "#B42318",
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
