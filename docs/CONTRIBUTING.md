# Contributing to MindGuide

Thanks for your interest in improving MindGuide. This guide covers the
basics of getting set up, the conventions the project follows, and how
to submit changes.

## 1. Setup

```bash
# Clone
git clone https://github.com/Taiwan-LZX/MindGuide.git
cd MindGuide

# Install dependencies (bun is the canonical package manager)
bun install

# Configure environment
cp .env.example .env
# Edit .env to point DATABASE_URL at your preferred SQLite location

# Initialize the database
bun run db:push

# Start the dev server
bun run dev
```

The app runs on `http://localhost:3000`. There is exactly one user-visible
route (`/`); everything else is a panel, modal, or feature view mounted
on top of that root.

## 2. Project conventions

### Tech stack (non-negotiable)
- **Next.js 16 + App Router** — no Pages Router, no custom server.
- **TypeScript 5 strict** — no `any` without justification, no
  `// @ts-ignore`.
- **Tailwind CSS 4 + shadcn/ui (New York style)** — no CSS-in-JS, no
  styled-components, no custom CSS files outside `globals.css`.
- **Prisma ORM + SQLite** — no raw SQL, no other ORMs.
- **Framer Motion** for animation — no GSAP, no anime.js, no CSS
  transitions for interactive elements.

### Styling rules
- **No indigo or blue brand colors.** The palette is OKLCH neutral
  grayscale. Use `bg-neutral-*`, `border-neutral-*`, `text-neutral-*`.
- **No 3D shadows.** Use 1px hairline borders (`border-neutral-200`)
  for separation. The only exception is popovers/modals, which may use
  `shadow-sm`.
- **No emoji or decorative symbols** (✨🎉🔥💡✓○● etc.) in UI strings.
  Use Lucide icons + text. This applies to AI system prompts too.
- **Serif headings** — use `font-serif` for page/section titles to
  maintain the scholarly aesthetic.
- **Sticky footer required** — if a page has a footer, it must stick
  to the viewport bottom on short pages and push down naturally on long
  pages. Use `min-h-screen flex flex-col` on the wrapper and `mt-auto`
  on the footer.

### Animation rules
- Every animated panel must have a named *personality* (see
  `docs/ANIMATION.md` §1). Don't invent a sixth spring without
  justifying the cognitive context it serves.
- **Never animate `width: %` for progress bars** — use
  `transform: scaleX()` with `transformOrigin: left`.
- **No `backdrop-filter` on closeable panels** — it causes a 100+ ms
  frame stall on exit. Use solid `bg-black/55` overlays.
- Exit animations must use **per-property easing split** — opacity
  uses `snoozeOut [0.16,1,0.3,1]` so frame 1 shows a visible fade.
  Don't apply a single `ease` to the whole `transition` object.
- Respect `prefers-reduced-motion` — check `useReducedMotion()` and
  fall back to opacity-only.

### Code style
- `'use client'` for components that use hooks/state/animation;
  `'use server'` for API route handlers.
- Import Prisma as `import { db } from '@/lib/db'`.
- Use existing shadcn/ui components — don't reinvent Button, Input,
  Dialog, etc.
- Long lists: `max-h-96 overflow-y-auto` with custom scrollbar styling.

## 3. Before you submit

### Lint gate (mandatory)

```bash
bun run lint
```

Must pass with **0 errors and 0 warnings**. ESLint config inherits
`eslint-config-next` plus project-specific overrides. If a rule feels
wrong, open an issue first — don't disable it inline.

### Browser QA (mandatory for animation / UX changes)

If your change touches animations, panel open/close, page transitions,
or any interactive behavior, verify in the browser:

1. Open the app, exercise the affected flow end-to-end.
2. Open DevTools → Performance → record a trace while interacting.
   Confirm no long tasks (>50 ms) during animations.
3. Test on mobile viewport (375 px width) — confirm no layout breakage
   and that touch interactions work.

If you have access to `agent-browser`, use it to drive the flow
programmatically and capture screenshots.

### Database changes

If you modify `prisma/schema.prisma`:

```bash
bun run db:push    # applies schema to local SQLite
# If migration history matters for downstream users, instead use:
bun run db:migrate --name <descriptive-name>
```

Document any breaking schema changes in your PR description.

## 4. Pull request checklist

- [ ] `bun run lint` passes with 0 errors / 0 warnings
- [ ] No new 3D shadows, no new brand colors, no emoji in UI strings
- [ ] If animation changed: per-property easing split applied to exits
- [ ] If progress bars added: using `scaleX`, not `width: %`
- [ ] If schema changed: `db:push` runs clean on a fresh database
- [ ] Browser QA on desktop (1280 px) and mobile (375 px)
- [ ] PR description explains *why*, not just *what*

## 5. Areas that particularly welcome contributions

- **Authentication** — NextAuth.js v4 is a dependency but not wired.
  A clean credentials + GitHub provider setup would unlock multi-user
  scenarios.
- **Mobile animations** — Cursor-follow spotlight currently stays at
  initial position on touch devices. A tap-to-show fallback would be
  welcome.
- **Scroll restoration** — Feature-to-feature transitions remount the
  view, losing scroll position. A cache keyed by `featureId` would fix
  this.
- **Intent-aware close duration** — Button (high intent) could close
  faster than outside-click (low intent). See `docs/ANIMATION.md` §6.
- **Tests** — The project currently relies on `agent-browser` + VLM
  for QA. A Jest / Playwright test suite would be a great addition.

## 6. License

By contributing, you agree that your contributions will be licensed
under the MIT License that covers the project.
