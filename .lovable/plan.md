

# Landing Page: Switch to EARTONE Sand Colorway

The landing page currently uses the dark Moltbook-inspired palette (deep charcoal `#16181d`, coral, teal). The rest of the app uses the warm sand/beige "EARTONE" palette from the `:root` variables (background `38 35% 78%`, primary `255 32% 35%`, accent `32 55% 65%`). This plan aligns the landing page to match.

---

## Changes

### 1. Update CSS Landing Variables (`src/index.css`, lines 68-85)

Replace the dark Moltbook landing variables with EARTONE-derived values:

```css
--landing-bg: 38 35% 78%;              /* warm sand background */
--landing-bg-elevated: 40 40% 94%;      /* cream card surfaces */
--landing-beige: 38 35% 78%;
--landing-violet: 255 32% 35%;          /* deep purple primary */
--landing-copper: 32 55% 65%;           /* warm copper accent */
--landing-cream: 40 40% 94%;
--landing-charcoal: 30 15% 18%;         /* dark text */
--landing-coral: 255 32% 35%;           /* primary purple (replaces coral) */
--landing-coral-light: 255 30% 50%;     /* lighter purple hover */
--landing-teal: 32 55% 65%;             /* copper as secondary */
--landing-teal-light: 32 60% 72%;       /* lighter copper hover */
--landing-text: 30 15% 18%;             /* dark charcoal text */
--landing-text-muted: 30 15% 40%;       /* muted brown text */
--landing-border: 32 40% 70%;           /* warm border */
```

### 2. Update Landing Page Components (`src/pages/Landing.tsx`)

- **LobsterHero SVG gradients**: Change coral fills to EARTONE copper/purple. Eye background from `#16181d` to cream.
- **Code blocks**: Change `bg-[#0d1117]` dark code backgrounds to `bg-[hsl(30,15%,18%)]` (charcoal from EARTONE palette) so they contrast against sand without the jarring pure-black look.
- **API table**: Update method badge colors from green/blue neon to earthy tones (e.g., deep green and purple tints).
- **Announcement banner**: From coral to primary purple.
- **Gradient sections**: `from-landing-coral/30` → `from-landing-violet/20` for subtler earthy gradients.
- **Testimonial avatar gradients**: Already use `from-landing-copper to-landing-violet` — will work naturally with new values.

### 3. Update MogLogo Badge (`src/components/MogLogo.tsx`)

- Change the "Alpha" badge from `bg-[hsl(350,82%,60%)]` coral to `bg-[hsl(255,32%,35%)]` (EARTONE primary purple).
- Update any hardcoded coral references in the SVG gradients to copper/purple.

---

## What Stays the Same
- All copy and content structure remains identical
- The Mog feed (`/watch`) keeps its dark theme — only the landing page changes
- Component structure (ValuePropCard, StatCard, etc.) unchanged — colors flow through CSS variables automatically

## Result
The landing page will use warm sand backgrounds, cream cards, purple CTAs, and copper accents — matching the app's EARTONE design system throughout.

