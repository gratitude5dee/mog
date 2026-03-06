

## Plan: Port WZRD.STUDIO Home Page Design System into Mog Project

This is a large undertaking — porting a complete premium dashboard design system with ~20 files from the WZRD.STUDIO reference project into the current Mog project. The reference files exist in `WZRD.STUDIO-main/` and need to be adapted and placed in `src/`.

### What Needs to Be Created/Modified

#### 1. New UI Components (copy from WZRD.STUDIO-main)
These components don't exist in the current project:
- `src/components/ui/number-ticker.tsx` — Animated number counting component
- `src/components/ui/text-animate.tsx` — Text animation component with multiple effects
- `src/components/ui/shimmer-button.tsx` — CTA button with shimmer highlight effect
- `src/components/ui/glass-button.tsx` — Glassmorphism button variants
- `src/components/ui/theme-toggle.tsx` — Dark/light mode toggle (currently exists at `src/components/ThemeToggle.tsx` — will create the UI version)

#### 2. New Home Components Directory (`src/components/home/`)
All 16 files — currently this directory is empty in the active project:
- `Sidebar.tsx` — Collapsible sidebar with navigation, favorites, credits
- `StatCard.tsx` — Glass-morphism stat cards with number tickers
- `SearchBar.tsx` — Debounced search input with focus animations
- `ProjectCard.tsx` — Project cards with hover effects, video preview, shine borders
- `ProjectList.tsx` — Grid layout for project cards
- `ProjectListView.tsx` — List/table layout for projects
- `NewProjectCard.tsx` — New project creation card
- `MobileHeader.tsx` — Mobile-responsive header
- `MobileBottomNav.tsx` — Mobile bottom navigation bar
- `MobileSidebarDrawer.tsx` — Mobile sidebar drawer
- `SortDropdown.tsx` — Sort options dropdown
- `ProjectViewModeSelector.tsx` — Grid/list toggle
- `WorkspaceSwitcher.tsx` — Workspace dropdown
- `InlineEditableTitle.tsx` — Inline title editing
- `ShareProjectDialog.tsx` — Project sharing dialog
- `DeleteProjectSheet.tsx` — Delete project confirmation sheet

#### 3. New Context
- `src/contexts/SidebarContext.tsx` — Sidebar collapsed state management with localStorage persistence

#### 4. New Design System File
- `src/lib/designSystem.ts` — JS design system constants (colors, glows, glass effects, gradients)

#### 5. CSS Updates (`src/index.css`)
Add the WZRD.STUDIO dark mode surface hierarchy variables (surface-0 through surface-4, border-subtle/default/strong, text hierarchy, accent colors, glow effects) and glassmorphism utility classes to the existing `.dark` block.

#### 6. Tailwind Config Updates (`tailwind.config.ts`)
Extend with:
- Surface color scale (surface-0 through surface-4)
- Text hierarchy colors (text-primary, text-secondary, text-tertiary, text-disabled)
- Border scale (border-subtle, border-default, border-strong)
- Accent colors (accent-teal, accent-purple, accent-amber, accent-emerald, accent-rose)
- Font families (display, body, mono)
- Box shadows (glow-purple, glow-teal, glow-amber)
- Glass utility plugin (glass-panel, glass-card, glass-stat, glass-sidebar, glass-input, glass-button)
- Shimmer-slide, spin-around, shine keyframes/animations

#### 7. New Page: `src/pages/Home.tsx`
The main 560-line dashboard page adapted for Mog's context. Dependencies on WZRD-specific things will be stubbed:
- `useAuth` → stub or connect to existing auth
- `useCredits`, `supabaseService`, `isDemoModeEnabled`, `OnboardingTour` → stub with minimal implementations
- Navigation routes adjusted for Mog's routing (`/watch` instead of `/timeline`)
- Logo reference changed from `wzrd-logo.png` to Mog's logo

#### 8. Supporting Hooks (stubs)
- `src/hooks/useProjectActions.ts` — Project delete action
- `src/hooks/useProjectShare.ts` — Share link generation
- `src/hooks/useUndoDelete.ts` — Undo project deletion
- `src/hooks/useOnboardingTour.ts` — Tour state management
- `src/hooks/useCredits.ts` — Credits display

### Adaptation Notes

The WZRD.STUDIO components reference several dependencies that need mapping:
- `@/providers/AuthProvider` → Will need a minimal stub or connect to Mog's existing auth
- `@/services/supabaseService` → Will use direct Supabase calls
- `@/components/demo/DemoBanner` → Will be omitted or stubbed
- `@/components/onboarding/OnboardingTour` → Will be stubbed
- `@/components/CreditsDisplay` → Will be stubbed
- `wzrd-logo.png` → Will use Mog's existing MogLogo component
- Route paths will be adapted for Mog's routing structure

### Implementation Order
1. CSS variables and Tailwind config (foundation)
2. Design system JS constants
3. SidebarContext
4. UI components (number-ticker, text-animate, shimmer-button, glass-button, theme-toggle)
5. Home sub-components (all 16 files)
6. Supporting hooks (stubs)
7. Home.tsx page
8. Wire into App routing

