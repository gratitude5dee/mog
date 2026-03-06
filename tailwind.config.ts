import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        playfair: ["Playfair Display", "serif"],
        display: ['var(--font-display)', 'Inter', 'system-ui', 'sans-serif'],
        body: ['var(--font-body)', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'JetBrains Mono', 'Fira Code', 'monospace'],
      },
      colors: {
        // Surface hierarchy
        surface: {
          0: 'hsl(var(--surface-0))',
          1: 'hsl(var(--surface-1))',
          2: 'hsl(var(--surface-2))',
          3: 'hsl(var(--surface-3))',
          4: 'hsl(var(--surface-4))',
        },
        // Border hierarchy
        'border-subtle': 'hsl(var(--border-subtle))',
        'border-default': 'hsl(var(--border-default))',
        'border-strong': 'hsl(var(--border-strong))',
        // Text hierarchy
        'text-primary': 'hsl(var(--text-primary))',
        'text-secondary': 'hsl(var(--text-secondary))',
        'text-tertiary': 'hsl(var(--text-tertiary))',
        'text-disabled': 'hsl(var(--text-disabled))',
        // Accent colors
        'accent-teal': 'hsl(var(--accent-teal))',
        'accent-purple': 'hsl(var(--accent-purple))',
        'accent-amber': 'hsl(var(--accent-amber))',
        'accent-emerald': 'hsl(var(--accent-emerald))',
        'accent-rose': 'hsl(var(--accent-rose))',
        // Landing page colors
        landing: {
          beige: "hsl(var(--landing-beige))",
          violet: "hsl(var(--landing-violet))",
          copper: "hsl(var(--landing-copper))",
          cream: "hsl(var(--landing-cream))",
          charcoal: "hsl(var(--landing-charcoal))",
          coral: "hsl(var(--landing-coral))",
          teal: "hsl(var(--landing-teal))",
          bg: "hsl(var(--landing-bg))",
          "bg-elevated": "hsl(var(--landing-bg-elevated))",
          "coral-light": "hsl(var(--landing-coral-light))",
          "teal-light": "hsl(var(--landing-teal-light))",
          text: "hsl(var(--landing-text))",
          "text-muted": "hsl(var(--landing-text-muted))",
          border: "hsl(var(--landing-border))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // Teal & Amber
        teal: {
          DEFAULT: 'hsl(var(--teal))',
          foreground: 'hsl(var(--teal-foreground))',
        },
        amber: {
          DEFAULT: 'hsl(var(--amber))',
          foreground: 'hsl(var(--amber-foreground))',
        },
        gold: 'hsl(var(--gold))',
        brand: {
          DEFAULT: "hsl(var(--brand))",
          foreground: "hsl(var(--brand-foreground))",
          muted: "hsl(var(--brand-muted))",
        },
        player: {
          DEFAULT: "hsl(var(--player-background))",
          foreground: "hsl(var(--player-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        glass: {
          primary: 'hsl(var(--glass-primary))',
          secondary: 'hsl(var(--glass-secondary))',
          accent: 'hsl(var(--glass-accent))',
          backdrop: 'hsl(var(--glass-backdrop))',
        },
        glow: {
          primary: 'hsl(var(--glow-primary))',
          secondary: 'hsl(var(--glow-secondary))',
          accent: 'hsl(var(--glow-accent))',
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        'glow-purple-sm': '0 0 8px rgba(147, 51, 234, 0.4), 0 0 15px rgba(147, 51, 234, 0.15)',
        'glow-purple-md': '0 0 15px rgba(147, 51, 234, 0.5), 0 0 25px rgba(147, 51, 234, 0.2)',
        'glow-teal-md': '0 0 15px rgba(20, 184, 166, 0.5), 0 0 25px rgba(20, 184, 166, 0.2)',
        'glow-teal': '0 0 20px hsl(var(--glow-teal)), 0 0 40px hsl(var(--glow-teal))',
        'glow-purple': '0 0 20px hsl(var(--glow-purple)), 0 0 40px hsl(var(--glow-purple))',
        'glow-amber': '0 0 20px hsl(var(--glow-amber)), 0 0 40px hsl(var(--glow-amber))',
      },
      keyframes: {
        equalizer: {
          "0%, 100%": { height: "4px" },
          "50%": { height: "16px" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-10px)" },
        },
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "pulse-glow": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.5" },
        },
        "slide-up": {
          from: { transform: "translateY(100%)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "fade-in-up": {
          from: { opacity: "0", transform: "translateY(20px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "spin-slow": {
          from: { transform: "rotate(0deg)" },
          to: { transform: "rotate(360deg)" },
        },
        // Magic UI Animations
        'shimmer-slide': {
          to: { transform: 'translate(calc(100cqw - 100%), 0)' },
        },
        'spin-around': {
          '0%': { transform: 'translateZ(0) rotate(0)' },
          '15%, 35%': { transform: 'translateZ(0) rotate(90deg)' },
          '65%, 85%': { transform: 'translateZ(0) rotate(270deg)' },
          '100%': { transform: 'translateZ(0) rotate(360deg)' },
        },
        'shine': {
          '0%': { backgroundPosition: '0% 0%' },
          '50%': { backgroundPosition: '100% 100%' },
          '100%': { backgroundPosition: '0% 0%' },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
        "slide-up": "slide-up 0.3s ease-out",
        "fade-in": "fade-in 0.2s ease-out",
        "fade-in-up": "fade-in-up 0.6s ease-out forwards",
        "spin-slow": "spin-slow 20s linear infinite",
        "equalizer": "equalizer 0.5s ease-in-out infinite",
        'shimmer-slide': 'shimmer-slide var(--speed) ease-in-out infinite alternate',
        'spin-around': 'spin-around calc(var(--speed) * 2) infinite linear',
        'shine': 'shine var(--duration) infinite linear',
      },
    },
  },
  plugins: [
    require("tailwindcss-animate"),
    function({ addUtilities }: any) {
      addUtilities({
        '.glass-panel': {
          'background': 'linear-gradient(135deg, rgba(15, 15, 20, 0.85) 0%, rgba(10, 12, 18, 0.95) 100%)',
          'backdrop-filter': 'blur(24px)',
          'border-color': 'rgba(255, 255, 255, 0.08)',
        },
        '.glass-card': {
          'background': 'linear-gradient(135deg, rgba(24, 24, 32, 0.7) 0%, rgba(18, 18, 26, 0.5) 100%)',
          'backdrop-filter': 'blur(16px)',
          'border-color': 'rgba(255, 255, 255, 0.1)',
        },
        '.glass-stat': {
          'background': 'linear-gradient(135deg, rgba(20, 20, 28, 0.75) 0%, rgba(16, 16, 22, 0.6) 100%)',
          'backdrop-filter': 'blur(20px)',
          'border-color': 'rgba(255, 255, 255, 0.08)',
        },
        '.glass-sidebar': {
          'background': 'linear-gradient(180deg, rgba(12, 12, 18, 0.92) 0%, rgba(8, 8, 12, 0.98) 100%)',
          'backdrop-filter': 'blur(40px)',
          'border-color': 'rgba(255, 255, 255, 0.04)',
        },
        '.glass-input': {
          'background-color': 'rgba(0, 0, 0, 0.35)',
          'backdrop-filter': 'blur(8px)',
          'border-color': 'rgba(255, 255, 255, 0.1)',
        },
        '.glass-button': {
          'background': 'linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%)',
          'backdrop-filter': 'blur(12px)',
          'border-color': 'rgba(255, 255, 255, 0.15)',
        },
      });
    },
  ],
} satisfies Config;