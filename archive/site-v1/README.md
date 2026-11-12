# g-magination

A studio reference site for **g-magination** — a tiny studio in Vienna turning
ordinary things into lamps. Design direction **04 · Quiet** (pastel studio, see
`BRAND-DIRECTIONS.md`), played warm and a little playful: blush paper, warm
ink, dusty rose, lowercase everything. No shop — the site is the studio
table: the lamps (SR01, Bubblegum) lie on it as white-bordered paper prints at
resting angles (hovering picks one up), with masking-tape labels, a taped-down
story note, and a little workbench mess (coffee ring, pencil, zip tie, screws).
Each lamp has its own page (`#/lamp/<id>`, hash router) where its photos —
pulled from the instagram posts — form a pile you leaf through: clicking
throws the top print off (alternating sides) and tucks it under the stack. Contact is a "say hi";
"notify me" blocks compose a plain email (no backend yet — swap the mailto in
`NotifyBlock.tsx` for a real endpoint when one exists). The cursor is a tiny
light bulb that switches on over links.

The hero starts dark: a pendant bulb on its red cable with a pull switch —
scrolling drags the cord until the light clicks on and the page becomes its
blush self (pinned 220svh hero, scroll-driven via CSS vars, `hero-dark` class
on <html> flips the top bar and cursor along). The page lives on a fixed
field of blurred light — soft drifting pools and tiny
rising motes — that parallaxes with scroll, leans with the cursor on desktop,
and leans with device tilt on touch. On fine pointers the cursor is a small ink
bulb carrying a pool of rose light — it switches on over anything clickable
(it stays on under reduced motion too, just without the trailing glow).

## Stack

- **Vite** + **React 19** + **TypeScript** (strict)
- **Tailwind CSS v4** (CSS-first config; brand tokens in `src/index.css`)
- Motion via plain CSS + CSS custom properties (no animation lib): hooks
  publish `--sp`/`--syv` (scroll) and `--nx`/`--ny` (cursor/tilt, damped) on
  `:root`; components read them with `var()` — no per-frame React renders
- **Space Grotesk**, self-hosted via `@fontsource`

The original 3D object (React Three Fiber) is preserved in `archive/object-3d/`.

## Develop

```bash
pnpm install
pnpm dev         # http://localhost:5173
pnpm build       # type-check + production build
pnpm preview     # serve the production build
pnpm lint
```

## Structure

```
src/
  App.tsx                      # shell: field · top bar · hero · object · footer · cursor
  index.css                    # Tailwind v4 + quiet design tokens + all motion CSS
  components/
    layout/    TopBar, Footer
    sections/  Hero            # pinned dark hero: pull the switch, light on
               Work            # floating lamp cards linking to their pages
               About           # three breaths of studio story
  pages/       LampPage        # one page per lamp (story, gallery, notify)
  data/        lamps.ts        # the lamps: copy, chips, photos, links
    ui/        QuietField      # fixed blurred background (scroll/tilt/cursor parallax)
               QuietCursor     # custom cursor (fine pointers only)
               Reveal, ScrollCue, GrainOverlay
  hooks/
    useScrollProgress          # publishes --sp / --syv
    useParallaxInput           # publishes --nx / --ny from cursor or device tilt
    useInViewOnce, usePrefersReducedMotion
```

Everything degrades to a still, fully-visible page under
`prefers-reduced-motion`, and the custom cursor never activates on touch.
