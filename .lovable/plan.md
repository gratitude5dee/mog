

## Plan: Restyle Landing Page with WZRD.STUDIO Premium Dark Design

The current `/landing` page uses the EARTONE sand colorway (warm beige backgrounds, muted tones). The user wants it restyled to match the WZRD.STUDIO premium dark aesthetic shown in the screenshots — black background, coral/orange accents, glassmorphism cards, motion backgrounds, and framer-motion animations.

### Approach

Rather than porting all ~15 WZRD landing sub-components individually (which would be massive), I will:

1. **Restyle the existing `Landing.tsx` in-place** — swap the `landing-*` color tokens from sand to dark premium values
2. **Port key WZRD landing components** that add the premium polish the screenshots show
3. **Update CSS variables** for the landing palette

### Changes

#### 1. Update CSS Variables (`src/index.css`)
Change the `landing-*` variables from EARTONE sand to premium dark:
- `--landing-bg` → near-black (`228 12% 5%`)
- `--landing-bg-elevated` → dark surface (`228 12% 9%`)
- `--landing-text` → near-white (`220 20% 95%`)
- `--landing-text-muted` → muted white (`220 10% 55%`)
- `--landing-coral` → coral/orange (`14 100% 64%`)
- `--landing-border` → subtle dark border (`228 10% 15%`)
- etc.

#### 2. Create Landing Sub-Components (`src/components/landing/`)
Port from WZRD.STUDIO-main, adapted for Mog branding:
- **`MotionBackground.tsx`** — Parallax gradient orbs, wave SVGs, floating particles (the hero background effect)
- **`HeroSection.tsx`** — Full-viewport hero with badge pill, gradient text headline, dual CTAs, scroll indicator
- **`FeatureGrid.tsx`** — 6-card grid with hover glow effects (adapted: Mog features instead of WZRD features)
- **`TestimonialCard.tsx`** — Glass card with avatar initials, quote marks
- **`TestimonialsSection.tsx`** — 3-column testimonial grid
- **`FAQAccordion.tsx`** — Animated expand/collapse with Plus icon rotation
- **`PricingSectionRedesigned.tsx`** — 4-tier pricing with annual toggle, glow highlights
- **`NewReleasePromo.tsx`** — Gradient CTA banner
- **`StickyFooter.tsx`** — Newsletter, 4-column links, social icons, back-to-top

#### 3. Rewrite `src/pages/Landing.tsx`
Replace the current monolithic page with the WZRD.STUDIO structure:
- Black background with radial gradient top glow
- Floating pill-shaped sticky header (desktop + mobile hamburger)
- Compose the above sub-components with Mog-adapted content (agent API docs, $5DEE tokenomics, Mog branding)
- Replace `useAuth` with wallet-based auth check
- Replace WZRD logo with `MogLogo`
- Adapt all routes (`/login` → `/auth`, `/demo` → `/home`, etc.)

### Content Adaptations (WZRD → Mog)
- Hero: "Agent-Native Generative Media Studio" badge, "Mog Studio" headline
- Features: Agent-First API, Vertical Video Feed, Earn $5DEE, etc. (keep existing Mog feature content)
- Use Cases: adapted for agent/creator use cases
- Testimonials: keep existing Mog testimonials
- Pricing: adapted for Mog tiers
- FAQ: adapted for Mog questions
- Footer: Mog branding, $5DEE reference

### Implementation Order
1. Update CSS landing variables to dark palette
2. Create all 9 landing sub-components
3. Rewrite Landing.tsx page to compose them
4. No routing changes needed (already at `/landing`)

