// Unified Design System for Mog Dashboard
// Provides consistent styling across all pages

export const designSystem = {
  bg: {
    primary: '#0A0A0F',
    secondary: '#0F0F14',
    tertiary: '#161620',
    hover: '#1A1A24',
    active: '#222230',
  },
  accent: {
    primary: '#8B5CF6',
    primaryHover: '#9D71F7',
    secondary: '#A78BFA',
    tertiary: '#7C3AED',
    glow: 'rgba(139, 92, 246, 0.3)',
  },
  border: {
    subtle: 'rgba(255, 255, 255, 0.06)',
    default: 'rgba(255, 255, 255, 0.1)',
    focus: '#8B5CF6',
    purple: 'rgba(139, 92, 246, 0.3)',
  },
  text: {
    primary: '#FFFFFF',
    secondary: '#A0A0A0',
    tertiary: '#707070',
    muted: '#505050',
    accent: '#A78BFA',
  },
  glows: {
    topLeft: {
      position: 'fixed' as const,
      top: '-20%',
      left: '-10%',
      width: '60%',
      height: '60%',
      background: 'radial-gradient(ellipse, rgba(139, 92, 246, 0.15) 0%, transparent 70%)',
      pointerEvents: 'none' as const,
      zIndex: 0,
    },
    bottomRight: {
      position: 'fixed' as const,
      bottom: '-20%',
      right: '-10%',
      width: '50%',
      height: '50%',
      background: 'radial-gradient(ellipse, rgba(124, 58, 237, 0.1) 0%, transparent 70%)',
      pointerEvents: 'none' as const,
      zIndex: 0,
    },
  },
  glass: {
    panel: {
      background: 'rgba(15, 15, 20, 0.8)',
      backdropFilter: 'blur(12px)',
      border: '1px solid rgba(255, 255, 255, 0.06)',
    },
    card: {
      background: 'rgba(22, 22, 32, 0.6)',
      backdropFilter: 'blur(8px)',
      border: '1px solid rgba(255, 255, 255, 0.08)',
    },
    header: {
      background: 'rgba(10, 10, 15, 0.9)',
      backdropFilter: 'blur(16px)',
      borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
    },
  },
  gradients: {
    purpleAccent: 'linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)',
    purpleGlow: 'linear-gradient(180deg, rgba(139, 92, 246, 0.2) 0%, transparent 100%)',
    darkFade: 'linear-gradient(180deg, rgba(10, 10, 15, 0) 0%, rgba(10, 10, 15, 1) 100%)',
    panelBg: 'linear-gradient(135deg, rgba(15, 15, 20, 0.95) 0%, rgba(10, 10, 15, 0.98) 100%)',
  },
  shadows: {
    glow: '0 0 40px rgba(139, 92, 246, 0.2)',
    glowIntense: '0 0 60px rgba(139, 92, 246, 0.3)',
    panel: '0 4px 24px rgba(0, 0, 0, 0.4)',
    elevated: '0 8px 32px rgba(0, 0, 0, 0.5)',
  },
} as const;

export const ambientGlowClasses = {
  wrapper: 'relative overflow-hidden',
  topLeftGlow: 'fixed top-[-20%] left-[-10%] w-[60%] h-[60%] bg-[radial-gradient(ellipse,rgba(139,92,246,0.15)_0%,transparent_70%)] pointer-events-none z-0',
  bottomRightGlow: 'fixed bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-[radial-gradient(ellipse,rgba(124,58,237,0.1)_0%,transparent_70%)] pointer-events-none z-0',
};

export const glassClasses = {
  panel: 'bg-[rgba(15,15,20,0.8)] backdrop-blur-xl border border-white/[0.06]',
  card: 'bg-[rgba(22,22,32,0.6)] backdrop-blur-lg border border-white/[0.08]',
  header: 'bg-[rgba(10,10,15,0.9)] backdrop-blur-2xl border-b border-white/[0.06]',
  sidebar: 'bg-gradient-to-br from-zinc-950/95 to-zinc-900/90 backdrop-blur-xl border-r border-white/[0.06]',
};