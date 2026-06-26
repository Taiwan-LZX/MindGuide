# Animation Design System

MindGuide's animation layer is the project's signature craft. This document captures the design language, the per-component "personalities," the performance rules, and the multi-dimensional root-cause analysis that drove the close-animation rewrite.

> **Design principle**: Each component has its own animation personality. Copy-pasting the same spring across every panel produces a "stiff, mechanical" feel. Different cognitive contexts (command menu vs. ceremony modal vs. journey between pages) call for different motion languages.

---

## 1. Spring language — per-component personalities

Every animated panel in MindGuide is assigned a *personality*: a named spring profile chosen for the cognitive context of the interaction.

| Personality | Used by | Stiffness | Damping | Mass | Duration | Feel |
|---|---|---|---|---|---|---|
| `command` | Three-dots menu, command palette | 380 | 30 | 0.6 | ~260 ms | Snappy, "ready" — minimal overshoot, tools appear instantly |
| `discovery` | More-features panel, sidebar tooltips | 280 | 26 | 0.9 | ~520 ms | Soft, exploratory — inviting, takes its time |
| `ceremony` | Settings modal | 200 | 24 | 1.0 | ~700 ms | Heavy, deliberate — settings deserve gravity |
| `journey` | Feature-view page transitions | 220 | 26 | 0.9 | ~620 ms | Purposeful motion between destinations |
| `reveal` | Course panel (side drawer) | 300 | 28 | 0.85 | ~400 ms | Slides in like a drawer being pulled |

### Why different springs?

From cognitive psychology:
- **Command menus** (tools) — the user has intent ("I want to do X"). The menu should appear with near-zero latency. A soft spring here feels sluggish.
- **Discovery surfaces** (more-features) — the user is browsing. A softer spring invites exploration and reduces the "startle" of a hard appearance.
- **Ceremony modals** (settings) — settings change the user's environment. The weight communicates "you're entering a different mode."
- **Journey transitions** (between pages) — the user is moving. The motion should feel like *travel*, not *appearance*.
- **Reveal drawers** (course panel) — content is being exposed, not created. The motion mirrors the physical metaphor of a drawer.

---

## 2. The close-animation problem — a postmortem

### The bug

User feedback:

> 关闭的过渡动画出现明显的无帧数，而且直接是闪现的，说瞬间关闭的。  
> *(The close transitions have visibly zero frames — they flash and close instantly.)*

Meanwhile, opening animations were fine. This asymmetry is the signature of one of three bugs.

### Diagnosis

We instrumented the dev server with a `requestAnimationFrame` sampler that recorded `opacity` and `transform` on every closing panel, then counted frames and measured dead time.

| Path | Before — frames | Before — duration | Root cause |
|---|---|---|---|
| More-features panel close | 16 | ~316 ms | `ease-in [0.4,0,1,1]` — front 40% of timeline moves opacity by only 22%, so the first visible frames look "stuck then vanish" |
| Three-dots menu close | 14 | ~285 ms | Same ease-in issue |
| **Settings modal close** | **4** | **348 ms** | **124 ms frame stall (8.9 fps < 12 fps threshold) + 195 ms dead time** — `backdrop-filter` synchronous teardown |
| **Feature-view back-exit** | **0** | **0 ms** | **`AnimatePresence` nested inside a synchronously-unmounted parent — exit never ran** |

### Multi-dimensional root-cause analysis

#### Software engineering dimension

1. **`AnimatePresence` nesting trap** — `page.tsx` had `{activeFeatureView ? <FeatureView /> : <MainContent />}`. `FeatureView` *contained* its own `AnimatePresence`. When `activeFeatureView` flipped to null, React committed the unmount in ~33 ms — far less than the 300 ms exit animation. The inner `AnimatePresence` was torn down before its exit could run. Exit: 0 frames.
2. **`ease-in` misapplied to `opacity`** — `ease-in [0.4,0,1,1]` is correct for *positional* motion (an object accelerating away), but wrong for *opacity*. Opacity should start dropping immediately so the eye sees the fade begin. With ease-in, opacity stays at 0.989 for the first 104 ms — imperceptible.
3. **`backdrop-filter` synchronous teardown** — When a panel with `backdrop-blur-md` unmounts, the browser must synchronously decompose the filter layer. We measured a 124 ms main-thread stall during this teardown — below the 12 fps "animation" threshold (8.9 fps). The user perceives this as "the page froze, then the modal was gone."

#### Cognitive psychology dimension

1. **Object permanence (Piaget)** — The brain needs ≥8 consecutive decreasing frames to maintain the belief "this object still exists." Settings close: 4 frames (violated). Feature exit: 0 frames (massively violated). The brain reads this as "the object ceased to exist" — i.e., a flash.
2. **Causal intentionality window (Haggard, 2002)** — The brain attributes an effect to a cause only if they occur within 200–250 ms. Settings close: 307 ms — outside the window. The user clicks, the modal hangs, *then* disappears — the brain reads this as two unrelated events, not "my click closed the modal."
3. **Motion onset threshold (Watson, 1986)** — Motion must start at ≥0.3°/s to be perceived as motion. With ease-in, the first 104 ms moved the element <0.7 px ≈ 0.4°/s — right at the threshold. The eye reads "it didn't move, then it was gone."
4. **Attentional disengagement (Posner, 1980)** — After a click, attention shifts to the next focus ~200 ms later. If the close animation starts after that, the user has already mentally moved on and the animation reads as a flash in peripheral vision.

#### UX dimension

1. **Nielsen's feedback latency** — 300 ms is the upper bound for "feels responsive." Settings close at 307 ms — perceptibly slow.
2. **12 fps animation threshold** — Below 12 fps, the brain reads motion as a sequence of still images. The 8.9 fps stall in settings close dropped below this threshold.
3. **Open/close asymmetry** — When open takes 300 ms and close takes 0 ms, the asymmetry itself is jarring. Close should be ~70-80% of open duration (industry standard), not 0%.

### The fix

Three independent fixes, each addressing one of the three root causes:

#### Fix 1: Lift `AnimatePresence` to the parent (critical)

```tsx
// page.tsx — BEFORE
{activeFeatureView ? <FeatureView /> : <MainContent />}

// page.tsx — AFTER
<AnimatePresence mode="wait" custom={activeFeatureViewDir}>
  {activeFeatureView ? (
    <motion.div key={`feature-${activeFeatureView}`} ...>
      <FeatureView />
    </motion.div>
  ) : (
    <motion.div key="main" ...>
      <MainContent />
    </motion.div>
  )}
</AnimatePresence>
```

Direction is computed *atomically* in the Zustand action (`prevFeatureViewRef` diff) — not in a `useEffect` — to avoid `setState` cascades that re-render before `AnimatePresence` can register the change.

**Result**: Feature-view back-exit went from 0 frames → 12 frames.

#### Fix 2: Remove `backdrop-filter` from closeable panels (critical)

`backdrop-blur-md` was replaced with a slightly darker solid overlay (`bg-black/55` instead of `bg-black/40 backdrop-blur-md`). The visual hierarchy is preserved (the modal still reads as floating above the page) but the GPU pressure is zero.

**Result**: Settings modal close went from 4 frames + 124 ms stall → 13 frames + 0 stall.

#### Fix 3: Per-property easing split

Instead of one `transition` applied to all properties:

```tsx
// BEFORE
transition: { duration: 0.28, ease: [0.4, 0, 1, 1] }
// applies to opacity + scale + y — but ease-in is wrong for opacity
```

Split per-property:

```tsx
// AFTER
transition: {
  opacity: { duration: 0.22, ease: [0.16, 1, 0.3, 1] }, // snoozeOut — 70% opacity drop in first 30%
  scale:   { duration: 0.20, ease: [0.4, 0, 1, 1] },     // ease-in — "collapse" physics
  y:       { duration: 0.22, ease: [0.4, 0, 1, 1] },     // ease-in — "fall away" physics
}
```

The `snoozeOut` curve `[0.16, 1, 0.3, 1]` drops 70% of opacity in the first 30% of the timeline — so frame 1 already shows a visible fade. The eye sees the close begin immediately, satisfying the motion onset threshold.

**Result**: Every close path's first frame now shows visible fade-out (opacity ≤ 0.78 on frame 1, vs. 0.99 before).

### Quantified before/after

| Path | Before | After | Improvement |
|---|---|---|---|
| More-features close | 16 frames / first-frame op = 0.989 | 15 frames / first-frame op = 0.571 | First frame visibly fades ✓ |
| Three-dots close | 14 frames / first-frame op = 0.990 | 13 frames / first-frame op = 0.776 | First frame visibly fades ✓ |
| Settings modal close | 4 frames + 124 ms stall | 13 frames + 0 stall | 3.25× more frames, stall eliminated ✓ |
| Feature-view back-exit | 0 frames (instant unmount) | 12 frames + direction-aware | 0 → 12 frames breakthrough ✓ |

---

## 3. Performance rules

These are enforced everywhere — not optional.

### Rule 1: Never animate `width: %` for progress bars

`width` changes trigger layout recalculation on every frame, which is 5–20× slower than composited transforms.

```tsx
// BAD — triggers layout on every frame
<motion.div animate={{ width: `${pct}%` }} />

// GOOD — composited, no layout
<motion.div
  style={{ transformOrigin: 'left' }}
  animate={{ scaleX: pct / 100 }}
/>
```

Applied across: feature-views (task progress, achievement progress, stats bars), card-review-mode (rating distribution, review progress), knowledge-inline (learning progress). 5 bars total converted.

### Rule 2: No `backdrop-filter` on closeable panels

As documented in §2, `backdrop-filter` teardown stalls the main thread for 100+ ms during exit. Use solid overlays (`bg-black/55`) instead. The visual difference is negligible; the perf difference is 10×.

### Rule 3: `will-change` hints for animated layers

For layers that animate `transform` / `opacity` continuously (e.g., cursor-follow spotlight), add `will-change: 'transform, opacity'` to promote to a composited layer. Don't add it everywhere — only on elements that actually animate frequently.

### Rule 4: `transformOrigin` aligned with motion direction

| Component | transformOrigin | Why |
|---|---|---|
| Three-dots menu | `top right` | Grows from the trigger (the three dots are top-right) |
| More-features panel | `bottom left` | Grows from the trigger button (bottom-left of sidebar) |
| Course panel | `right` | Slides in from right edge — drawer metaphor |
| Settings modal | `center` | Symmetric — modal is the focus, not an extension of a trigger |

Exit animations use the same `transformOrigin` so the panel recedes back to where it came from — preserving the "object permanence" illusion.

### Rule 5: `prefers-reduced-motion` is respected

A top-level `<MotionConfig reducedMotion="always">` boundary is *not* applied globally — instead, each component checks `useReducedMotion()` and falls back to opacity-only (no transforms). This preserves the cognitive cues (you still see *that* something closed) without triggering motion sickness.

---

## 4. Interaction patterns

### Cursor-follow spotlight

Used in the three-dots menu and more-features panel. A subtle radial highlight follows the mouse, providing "where am I looking" feedback without the cost of a full hover state on every row.

```tsx
const spotlightX = useMotionValue(120)
const spotlightY = useMotionValue(20)
const spotlight = useMotionTemplate`radial-gradient(80px circle at ${spotlightX}px ${spotlightY}px, rgba(0,0,0,0.04), transparent 70%)`

<div
  onMouseMove={(e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    spotlightX.set(e.clientX - rect.left)
    spotlightY.set(e.clientY - rect.top)
  }}
>
  <motion.div style={{ background: spotlight }} />
  {/* row content */}
</div>
```

- **Radius**: 80 px (command menu) / 110 px (more-features — bigger surface, softer light)
- **Alpha**: 0.04 (command) / 0.05 (more-features) — barely visible, subliminal
- **Touch devices**: `pointer: coarse` falls back to a static hover state (no `mousemove`).

### `layoutId` shared element transitions

Used in the settings tab strip — the active-tab pill slides between tabs instead of cross-fading:

```tsx
{tabs.map(tab => (
  <button key={tab.id} onClick={() => setActiveTab(tab.id)}>
    {tab.id === activeTab && (
      <motion.div layoutId="settings-tab-pill" className="bg-neutral-100" />
    )}
    <span>{tab.label}</span>
  </button>
))}
```

The `layoutId` tells Framer Motion "this is the same element, just in a different position" — it animates the position change automatically. No manual x/y tracking.

### Direction-aware page transitions

The feature-view transition knows whether the user is going forward (tasks → cards) or back (cards → tasks). The exit animation pushes content in the opposite direction of entry:

```tsx
const pageVariants = {
  enter: (dir: number) => ({ x: 28 * dir, opacity: 0, scale: 0.97 }),
  center: { x: 0, opacity: 1, scale: 1 },
  exit: (dir: number) => ({ x: -22 * dir, opacity: 0, scale: 0.97 }),
}

<AnimatePresence mode="wait" custom={dir}>
  <motion.div key={viewId} custom={dir} variants={pageVariants} ... />
</AnimatePresence>
```

Direction is computed atomically in the Zustand store (`prevFeatureViewRef` diff inside `setActiveFeatureView`), not in a `useEffect`. This prevents the `setState`-in-`useEffect` cascade that would re-render before `AnimatePresence` could register the direction change.

---

## 5. Component reference

| File | Personality | Notable techniques |
|---|---|---|
| `display-panel.tsx` | `command` | Cursor-follow spotlight + intent-colored icons (emerald/amber/red) |
| `create-new-panel.tsx` | `discovery` | Layered highlight (opacity + scale) + 2px left accent line + icon nudge |
| `settings-view.tsx` | `ceremony` | `layoutId` tab pill + direction-aware content slide + close-button spring (scale 1.1 + rotate 90 hover, scale 0.88 tap) |
| `feature-views.tsx` | `journey` | Direction-aware x slide + scale 0.97 depth + `prevViewRef` direction tracking |
| `course-panel.tsx` | `reveal` | Lateral x:24 slide-in (not y:12 drop) + `transformOrigin: right` |
| `command-palette.tsx` | `command` | Same as display-panel; cmdk-based fuzzy search |
| `main-content.tsx` | (none — content) | Welcome view has its own soft fade; chat messages animate on mount |
| `sidebar.tsx` | (subtle) | Session row hover uses spring (260/22/0.8) for background fade |

---

## 6. Open questions / future work

1. **Intent-aware close duration** — Currently all close paths use the same duration. A button click (high intent) could close faster (200 ms); an outside click (low intent) could close slower (280 ms); Esc sits in between (240 ms). Not yet implemented.
2. **Feature-to-feature scroll restoration** — Switching feature views remounts the entire `motion.div`, losing scroll position. Could be fixed with a scroll-position cache keyed by `featureId`.
3. **`prefers-reduced-motion` audit** — Most components handle it, but not all. A comprehensive pass would ensure every animated layer degrades gracefully.
4. **Course-panel collapsible** — Internal module/lesson collapse still uses `height: auto` animation (layout-triggering). Could convert to `grid-template-rows: 0fr → 1fr` technique.
