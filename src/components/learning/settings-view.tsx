'use client';

import React, { createContext, useCallback, useContext, useRef, useState, useSyncExternalStore } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MOTION, panelMotion, slideMotion } from '@/lib/motion-tokens';
import {
  X,
  Sun,
  Moon,
  Monitor,
  PanelLeft,
  Columns2,
  Maximize2,
  GraduationCap,
  Upload,
  Check,
  RotateCcw,
  Palette,
  Sparkles,
  Zap,
  Eye,
  Layout,
  Image as ImageIcon,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { useLearningStore } from '@/store/learning-store';
import { usePreferences } from '@/store/preferences-store';
import { extractDominantColor, type ExtractedColor } from '@/lib/color-extract';

// ─── SettingsView ──────────────────────────────────────────────────────────
// A full-screen, in-app detailed settings interface. Triggered by the "设置"
// entry inside the three-dot quick menu (display-panel.tsx). Consolidates all
// display preferences — 外观 (theme + motion), 布局, 配色 (image → accent),
// 关于 — that previously lived scattered across the small popover.
//
// Layout mirrors a portfolio-card reference (left nav/list 60% + right preview
// 40%). The right "preview" pane is the key creative touch: every interactive
// *sub-item* (a theme option, the motion toggle, a layout card, the palette
// upload…) publishes a structured "hint" — kicker / title / Currently list /
// Previously note — and hovering that item retargets the right pane to show
// it, with a soft cross-fade. So the right pane is both a live preview AND an
// contextual explainer, the same "hover to reveal" mechanism as 更多功能 but
// rendered in-place and far more detailed.

// SSR-safe mounted flag (next-themes is undefined until hydration).
const emptySubscribe = () => () => {};
const getTrue = () => true;
const getFalse = () => false;

const themeOptions = [
  { value: 'light', label: '浅色', icon: Sun },
  { value: 'dark', label: '深色', icon: Moon },
  { value: 'system', label: '系统', icon: Monitor },
] as const;

type TabKey = 'appearance' | 'layout' | 'palette' | 'about';

const tabs: { key: TabKey; label: string }[] = [
  { key: 'appearance', label: '外观' },
  { key: 'layout', label: '布局' },
  { key: 'palette', label: '配色' },
  { key: 'about', label: '关于' },
];

// ─── Hint system ───────────────────────────────────────────────────────────
// Each interactive sub-item registers a `hintId`. When hovered, the right
// preview pane swaps to that hint's structured content (kicker / title /
// Currently bullets / Previously note / demo kind). When nothing is hovered,
// the pane shows the active tab's default hint. This is the "hover to reveal"
// pattern from 更多功能, but rendered in-place on the right pane instead of as
// a floating tooltip — so it can carry much richer content without overlapping
// the UI.

type DemoKind = 'theme-swatch' | 'motion' | 'layout-mock' | 'palette-flow' | 'about-card';

interface Hint {
  /** Small uppercase label, e.g. "外观 · 浅色". */
  kicker: string;
  /** Large serif title, e.g. "浅色模式". */
  title: string;
  /** One-line subtitle under the title. */
  subtitle: string;
  /** Bulleted "currently" list — the reference image's signature structure. */
  currently: string[];
  /** Optional "previously" paragraph for extra context. */
  note?: string;
  /** Which mini-demo to render at the bottom of the pane. */
  demo: DemoKind;
  /** Optional icon override for the top-right demo mark. */
  icon?: React.ElementType;
}

const hintMap: Record<string, Hint> = {
  // ── Appearance: theme ──
  'theme-light': {
    kicker: '外观 · 主题',
    title: '浅色模式',
    subtitle: '明亮清爽的阅读环境',
    currently: ['白底高对比，适合白天与高亮环境', '长时间阅读文字更清晰', '与多数学习材料默认排版一致'],
    note: '若系统处于深色，此处仍保持浅色。',
    demo: 'theme-swatch',
    icon: Sun,
  },
  'theme-dark': {
    kicker: '外观 · 主题',
    title: '深色模式',
    subtitle: '降低屏幕亮度，减少眼睛疲劳',
    currently: ['深灰底色，夜间专注更舒适', '减少蓝光刺激', 'UI 元素以浅色描边呈现'],
    note: 'OLED 屏幕可额外省电。',
    demo: 'theme-swatch',
    icon: Moon,
  },
  'theme-system': {
    kicker: '外观 · 主题',
    title: '跟随系统',
    subtitle: '随操作系统自动切换',
    currently: ['日间浅色 / 夜间深色自动切换', '与 macOS / iOS 外观偏好同步', '无需手动维护两套偏好'],
    note: '系统切换时即时生效，无需刷新。',
    demo: 'theme-swatch',
    icon: Monitor,
  },
  // ── Appearance: motion ──
  'motion-on': {
    kicker: '外观 · 动态效果',
    title: '启用动画',
    subtitle: '丝滑的过渡与微交互',
    currently: ['卡片渐入与列表错峰出现', '鼠标跟随提示平滑跟随', '面板弹簧式展开'],
    note: '尊重系统「减少动态效果」偏好——若系统已开启，动画仍会被精简。',
    demo: 'motion',
    icon: Zap,
  },
  'motion-off': {
    kicker: '外观 · 动态效果',
    title: '关闭动画',
    subtitle: '即时响应，减少视觉波动',
    currently: ['所有过渡瞬时完成', '去除弹簧与缩放反馈', '适合专注与无障碍场景'],
    note: '仅保留淡入淡出，界面仍清晰可读。',
    demo: 'motion',
    icon: Eye,
  },
  // ── Layout ──
  'layout-side': {
    kicker: '布局 · 显示模式',
    title: '侧栏模式',
    subtitle: '侧边栏 + 主区域',
    currently: ['会话列表常驻左侧', '快速切换学习主题', '主区域居中阅读宽度'],
    note: '默认布局，适合日常学习。',
    demo: 'layout-mock',
    icon: PanelLeft,
  },
  'layout-half': {
    kicker: '布局 · 显示模式',
    title: '分屏模式',
    subtitle: '侧边栏与内容并排',
    currently: ['宽屏高效浏览', '列表与对话同屏可见', '适合大尺寸显示器'],
    note: '侧边栏宽度自适应。',
    demo: 'layout-mock',
    icon: Columns2,
  },
  'layout-full': {
    kicker: '布局 · 显示模式',
    title: '全屏模式',
    subtitle: '隐藏侧边栏，沉浸专注',
    currently: ['主区域占据全部宽度', '无会话列表干扰', '适合深度阅读与写作'],
    note: '侧边栏可随时通过折叠图标恢复。',
    demo: 'layout-mock',
    icon: Maximize2,
  },
  // ── Palette ──
  'palette-upload': {
    kicker: '配色 · 图片取色',
    title: '智能提取主色',
    subtitle: '从任意图片生成项目主题色',
    currently: ['Canvas 降采样并量化像素', '饱和度加权选出最鲜活的色调', '一键应用到全站强调元素'],
    note: '颜色持久化到本地，刷新后保留；可随时重置恢复中性灰。',
    demo: 'palette-flow',
    icon: ImageIcon,
  },
  'palette-reset': {
    kicker: '配色 · 重置',
    title: '恢复中性配色',
    subtitle: '回到默认的中性灰强调',
    currently: ['移除自定义主题色', '主按钮与图标恢复深色 / 浅色', '保留主题与动态效果偏好'],
    note: '可随时重新上传图片提取新色。',
    demo: 'palette-flow',
    icon: RotateCcw,
  },
  // ── Tab defaults (shown when nothing is hovered) ──
  'tab-appearance': {
    kicker: '预览 · 外观',
    title: '外观',
    subtitle: '主题与动态效果',
    currently: ['浅色 / 深色 / 跟随系统', '动画开关与无障碍偏好', '悬停各项查看详细说明'],
    demo: 'theme-swatch',
    icon: Sparkles,
  },
  'tab-layout': {
    kicker: '预览 · 布局',
    title: '布局',
    subtitle: '侧边栏与内容的显示比例',
    currently: ['侧栏 / 分屏 / 全屏 三种模式', '悬停各项查看示意图', '选择会即时应用'],
    demo: 'layout-mock',
    icon: Layout,
  },
  'tab-palette': {
    kicker: '预览 · 配色',
    title: '配色',
    subtitle: '从图片提取主题色',
    currently: ['上传图片智能取色', '应用到全站强调元素', '悬停各区域了解机制'],
    demo: 'palette-flow',
    icon: Palette,
  },
  'tab-about': {
    kicker: '预览 · 关于',
    title: 'MindGuide',
    subtitle: 'AI 对话式学习平台',
    currently: ['苏格拉底式追问引导建构知识', '自动生成结构化课程', '知识图谱与间隔重复卡片'],
    note: '悬停各项可了解更多细节。',
    demo: 'about-card',
    icon: GraduationCap,
  },
  // ── About sub-items ──
  'about-version': {
    kicker: '关于 · 版本',
    title: 'v1.2.0',
    subtitle: '当前发布版本',
    currently: ['集成设置界面与图片取色', 'hover 提示精致化', '外观设置入口统一至三个点菜单'],
    note: '遵循语义化版本号，后续迭代持续向后兼容。',
    demo: 'about-card',
    icon: GraduationCap,
  },
  'about-stack': {
    kicker: '关于 · 技术栈',
    title: 'Next.js 16 · TypeScript',
    subtitle: '现代全栈技术栈',
    currently: ['App Router + Turbopack 热更新', 'Tailwind CSS 4 原子化样式', 'Prisma ORM + SQLite 数据层'],
    note: 'AI 能力由 z-ai-web-dev-sdk 提供，仅在后端调用。',
    demo: 'about-card',
    icon: Layout,
  },
  'about-accent': {
    kicker: '关于 · 主题色',
    title: '可自定义的项目配色',
    subtitle: '从「配色」tab 上传图片提取',
    currently: ['Canvas 像素采样与量化', '饱和度加权选出主色', 'CSS 变量驱动全站强调元素'],
    note: '颜色持久化到 localStorage，可随时重置。',
    demo: 'palette-flow',
    icon: Palette,
  },
};

interface HintCtx {
  /** The currently hovered hint id, or null when nothing is hovered. */
  hovered: string | null;
  setHovered: (id: string | null) => void;
}

const HintContext = createContext<HintCtx>({ hovered: null, setHovered: () => {} });
const useHint = () => useContext(HintContext);

// ─── Personality: "ceremony" ───────────────────────────────────────────────
// The settings modal is the most "formal" surface in the app — the user has
// paused their work to change a preference. The motion should signal that
// gravity: heavier mass, slower settle, a touch of depth via scale.
//
// Differentiation vs. other panels:
//  · Quick menu (command): 380/30/0.6 — snappy, ~260ms, near-zero overshoot.
//  · More features (discovery): 280/26/0.9 — soft, ~520ms, ~2% overshoot.
//  · Settings (ceremony): 200/24/1.0 — heavy, ~700ms, deliberate settle.
//
// The scale 0.94 → 1 with transformOrigin 'center' gives a subtle "opening
// up" depth cue — like a card pulled from a deck and laid flat.
//
// EXIT EASING RATIONALE (anim-refine-003 — "关闭的过渡动画无帧数直接闪现"):
//   · Previous exit used a single transition { duration: 0.28, ease: [0.4,0,1,1] }
//     applied to ALL three properties (opacity, scale, y).
//   · [0.4, 0, 1, 1] is a strong ease-IN (slow start, fast end). For opacity,
//     this meant: opacity stayed near 1.0 for the first 40% of duration
//     (112ms), then crashed to 0 in the last 60%. Combined with the React
//     commit delay (~50ms), the user perceived ~160ms of "nothing happening"
//     followed by a sudden vanish — the "instant close" perception.
//   · Diagnostic measurement (worklog anim-refine-003) confirmed: settings
//     close captured only 4 frames over 348ms — well below the 12-frame
//     "perceived as animation" threshold — and one frame gap stretched to
//     112ms (8.9fps), which the brain reads as a "still image" not motion.
//
// FIX:
//   · Split per-property transitions so opacity can lead (fast fade from
//     frame 1) while scale/y provide the physical "departing" metaphor.
//   · Switch opacity to ease-OUT [0.16, 1, 0.3, 1] (snoozeOut): 70% of the
//     opacity drop happens in the first 30% of duration — the user sees the
//     modal becoming transparent IMMEDIATELY, no dead-time window.
//   · Keep scale/y on ease-IN [0.4, 0, 1, 1] but with a SHORTER duration
//     (0.20s vs 0.28s) so they finish before opacity completes — the panel
//     "shrinks + drops" first, then continues fading out as a ghost.
//   · Total perceived duration ~260ms, with visible motion starting at
//     frame 1 (vs ~frame 12 before).
// ─── Motion variants ───────────────────────────────────────────────────────
// Uses shared motion-tokens. Principle: EXIT = ENTER reversed (same target
// values as `hidden`, same spring physics). See motion-tokens.ts.
//
// `panelVariants` = panelMotion (spring, exit mirrors enter).
// `contentVariants` = slideMotion (direction-aware, exit slides opposite way).
// `hintVariants` = custom (exit = hidden values + same spring).
const panelVariants = panelMotion;

const contentVariants = slideMotion;

const hintVariants = {
  hidden: { opacity: 0, y: 6, scale: 0.99 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: MOTION.enterSnappy,
  },
  // Exit = hidden values + same spring. Reverse of enter.
  exit: {
    opacity: 0,
    y: 6,
    scale: 0.99,
    transition: MOTION.enterSnappy,
  },
};

export function SettingsView() {
  const open = useLearningStore(s => s.settingsViewOpen);
  const setOpen = useLearningStore(s => s.setSettingsViewOpen);
  const [activeTab, setActiveTab] = useState<TabKey>('appearance');
  const [hovered, setHovered] = useState<string | null>(null);

  // Track tab-switch direction so the content slide knows which way to push.
  // -1 = moving left (back in tab order), +1 = moving right (forward).
  const prevTabIdxRef = useRef(0);
  const [tabDir, setTabDir] = useState<1 | -1>(1);
  const switchTab = (next: TabKey) => {
    if (next === activeTab) return;
    const nextIdx = tabs.findIndex(t => t.key === next);
    setTabDir(nextIdx >= prevTabIdxRef.current ? 1 : -1);
    prevTabIdxRef.current = nextIdx;
    setActiveTab(next);
  };

  // Close on Escape.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  // Reset hover when the panel closes / tab changes, so reopening doesn't show
  // a stale hint from a previous session. Also reset tab direction so a fresh
  // open always reads as "forward".
  React.useEffect(() => {
    if (!open) {
      setHovered(null);
      prevTabIdxRef.current = 0;
      setTabDir(1);
    }
  }, [open]);
  React.useEffect(() => {
    setHovered(null);
  }, [activeTab]);

  return (
    <HintContext.Provider value={{ hovered, setHovered }}>
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop — solid dark overlay (no backdrop-blur: it caused a
                124ms main-thread stall on close, see worklog anim-refine-003).
                Symmetric enter/exit: same duration + ease so close mirrors open. */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: MOTION.backdrop }}
              exit={{ opacity: 0, transition: MOTION.backdropExit }}
              // P2-#46: unified backdrop — bg-neutral-900/40 + backdrop-blur-[2px],
              // matching keyboard-shortcuts-overlay. Was bg-black/55 (too dark, no blur).
              className="fixed inset-0 z-[60] bg-neutral-900/40 backdrop-blur-[2px]"
              onClick={() => setOpen(false)}
            />

            {/* Card — centered, replicates the portfolio-card reference: one
                rounded container split left (nav + content) / right (preview). */}
            <motion.div
              variants={panelVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              role="dialog"
              aria-label="设置"
              className="fixed left-1/2 top-1/2 z-[61] flex h-[min(640px,90vh)] w-[min(1000px,94vw)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-[0_24px_64px_-12px_rgba(0,0,0,0.22)] dark:border-neutral-700 dark:bg-neutral-900"
            >
              {/* ── Left: nav + content (≈58%) ── */}
              <div className="flex w-[58%] flex-col border-r border-neutral-200 dark:border-neutral-800">
                {/* Header — title row */}
                <div className="flex items-center justify-between px-6 pt-5 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-serif text-[18px] font-medium tracking-tight text-neutral-900 dark:text-neutral-100">
                      设置
                    </span>
                    <span className="text-[11px] text-neutral-400 dark:text-neutral-500">· Settings</span>
                  </div>
                  {/* Close button — spring hover/tap. The previous version used
                      a CSS transition-transform which felt flat and had no
                      press feedback, the "exit function transition" issue the
                      user flagged. Now it has a tactile depress on click. */}
                  <motion.button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="关闭"
                    whileHover={{
                      scale: 1.1,
                      rotate: 90,
                      // P2-#50: damping 18 → 26 to eliminate the ~100° overshoot
                      // that made the X icon "jiggle" past 90°.
                      transition: { type: 'spring', stiffness: 320, damping: 26, mass: 0.6 },
                    }}
                    whileTap={{
                      scale: 0.88,
                      transition: { type: 'spring', stiffness: 700, damping: 28 },
                    }}
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-200 text-white transition-colors hover:bg-neutral-300 dark:bg-neutral-700 dark:hover:bg-neutral-600"
                  >
                    <X className="h-3.5 w-3.5" strokeWidth={2.5} />
                  </motion.button>
                </div>

                {/* Tab strip — pill-style. Selected tab gets a layoutId-backed
                    shared background that slides between tabs (a single
                    motion.span with layoutId='settings-tab-pill' lives inside
                    the selected button). This gives the "liquid follow" feel
                    the user asked about for the more-features panel, applied
                    here to the tab navigation. */}
                <div className="flex gap-1 px-6 pb-3">
                  {tabs.map(t => {
                    const selected = activeTab === t.key;
                    return (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => switchTab(t.key)}
                        className={`relative rounded-lg px-3.5 py-1.5 text-[12.5px] font-medium transition-colors duration-200 ${
                          selected
                            ? 'text-neutral-900 dark:text-neutral-100'
                            : 'text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200'
                        }`}
                      >
                        {selected && (
                          <motion.span
                            layoutId="settings-tab-pill"
                            className="absolute inset-0 rounded-lg bg-neutral-100 dark:bg-neutral-800"
                            transition={{ type: 'spring', stiffness: 380, damping: 30, mass: 0.7 }}
                            style={{ zIndex: -1 }}
                          />
                        )}
                        <span className="relative z-10">{t.label}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="mx-6 h-px bg-neutral-100 dark:bg-neutral-800" />

                {/* Content — scrollable. Direction-aware: the new tab slides in
                    from the direction the user clicked (right tab → enters
                    from the right; left tab → enters from the left). The exit
                    mirrors it so the old content leaves the opposite way. */}
                <div className="custom-scrollbar flex-1 overflow-y-auto px-6 py-5">
                  <AnimatePresence mode="popLayout" custom={tabDir}>
                    <motion.div
                      key={activeTab}
                      custom={tabDir}
                      variants={contentVariants}
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                    >
                      {activeTab === 'appearance' && <AppearanceTab />}
                      {activeTab === 'layout' && <LayoutTab />}
                      {activeTab === 'palette' && <PaletteTab />}
                      {activeTab === 'about' && <AboutTab />}
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>

              {/* ── Right: preview pane (≈42%) ── */}
              <SettingsPreview activeTab={activeTab} />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </HintContext.Provider>
  );
}

// ─── Appearance Tab ────────────────────────────────────────────────────────

function AppearanceTab() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const { motionEnabled, setMotionEnabled } = usePreferences();
  const { setHovered } = useHint();
  const mounted = useSyncExternalStore(emptySubscribe, getTrue, getFalse);
  const isDark = mounted && resolvedTheme === 'dark';
  const activeTheme = theme ?? (isDark ? 'dark' : 'light');

  return (
    <div className="space-y-6">
      {/* Theme */}
      <section>
        <SectionLabel title="主题" hint="色彩模式" />
        <div className="flex gap-1 rounded-xl bg-neutral-100 p-1 dark:bg-neutral-800/80">
          {themeOptions.map(opt => {
            const selected = activeTheme === opt.value;
            const OptIcon = opt.icon;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setTheme(opt.value)}
                onMouseEnter={() => setHovered(`theme-${opt.value}`)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(`theme-${opt.value}`)}
                onBlur={() => setHovered(null)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[12.5px] font-medium transition-colors duration-200 ${
                  selected
                    ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-neutral-50'
                    : 'text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200'
                }`}
              >
                <OptIcon className="h-3.5 w-3.5" />
                {opt.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* Motion */}
      <section>
        <SectionLabel title="动态效果" hint="动画与过渡" />
        <div
          onMouseEnter={() => setHovered(motionEnabled ? 'motion-on' : 'motion-off')}
          onMouseLeave={() => setHovered(null)}
          className="flex items-start justify-between gap-3 rounded-xl border border-neutral-200 px-4 py-3 transition-colors hover:border-neutral-300 dark:border-neutral-800 dark:hover:border-neutral-700"
        >
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-neutral-700 dark:text-neutral-200">
              启用界面动画
            </p>
            <p className="mt-1 text-[11.5px] leading-relaxed text-neutral-400 dark:text-neutral-500">
              关闭后动画即时完成，减少视觉波动；尊重系统「减少动态效果」偏好
            </p>
          </div>
          <Toggle checked={motionEnabled} onChange={() => setMotionEnabled(!motionEnabled)} label="切换动态效果" />
        </div>
      </section>
    </div>
  );
}

// ─── Layout Tab ────────────────────────────────────────────────────────────

const layoutOptions = [
  { value: 'side' as const, label: '侧栏', icon: PanelLeft, desc: '侧边栏 + 主区域' },
  { value: 'half' as const, label: '分屏', icon: Columns2, desc: '侧边栏与内容分屏' },
  { value: 'full' as const, label: '全屏', icon: Maximize2, desc: '隐藏侧边栏，专注内容' },
];

function LayoutTab() {
  const displayMode = useLearningStore(s => s.displayMode);
  const setDisplayMode = useLearningStore(s => s.setDisplayMode);
  const { setHovered } = useHint();
  return (
    <div className="space-y-5">
      <SectionLabel title="布局" hint="显示模式" />
      <div className="grid grid-cols-3 gap-3">
        {layoutOptions.map(opt => {
          const selected = displayMode === opt.value;
          const OptIcon = opt.icon;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setDisplayMode(opt.value)}
              onMouseEnter={() => setHovered(`layout-${opt.value}`)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(`layout-${opt.value}`)}
              onBlur={() => setHovered(null)}
              className={`flex aspect-square flex-col items-center justify-center gap-1.5 rounded-xl border transition-all duration-200 ${
                selected
                  ? 'border-neutral-900 bg-white shadow-sm dark:border-neutral-200 dark:bg-neutral-800'
                  : 'border-neutral-200 bg-white hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700'
              }`}
            >
              <OptIcon
                className={`h-5 w-5 transition-colors ${
                  selected ? 'text-neutral-900 dark:text-neutral-100' : 'text-neutral-400 dark:text-neutral-500'
                }`}
              />
              <span
                className={`text-[11.5px] font-medium leading-none transition-colors ${
                  selected ? 'text-neutral-900 dark:text-neutral-100' : 'text-neutral-500 dark:text-neutral-400'
                }`}
              >
                {opt.label}
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-[11.5px] leading-relaxed text-neutral-400 dark:text-neutral-500">
        {layoutOptions.find(o => o.value === displayMode)?.desc}
      </p>
    </div>
  );
}

// ─── Palette Tab (image → accent extraction) ──────────────────────────────

function PaletteTab() {
  const { accentColor, setAccentColor } = usePreferences();
  const { setHovered } = useHint();
  const fileRef = useRef<HTMLInputElement>(null);
  const [extracting, setExtracting] = useState(false);
  const [preview, setPreview] = useState<ExtractedColor | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [thumb, setThumb] = useState<string | null>(null);

  const hasAccent = Boolean(accentColor);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      if (!file.type.startsWith('image/')) {
        setError('请选择图片文件');
        return;
      }
      setExtracting(true);
      // Show a thumbnail of the picked image while we compute the color.
      const url = URL.createObjectURL(file);
      setThumb(url);
      try {
        const color = await extractDominantColor(file);
        if (!color) {
          setError('未能从图片中提取到合适的颜色，请换一张试试');
          setPreview(null);
        } else {
          setPreview(color);
        }
      } catch {
        setError('图片解析失败');
        setPreview(null);
      } finally {
        setExtracting(false);
      }
    },
    [],
  );

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
    e.target.value = '';
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const apply = () => {
    if (preview) {
      setAccentColor(preview.hex);
    }
  };

  const reset = () => {
    setAccentColor(null);
    setPreview(null);
    setThumb(null);
    setError(null);
  };

  return (
    <div className="space-y-5">
      <SectionLabel title="配色" hint="从图片提取主题色" />

      <div
        onDragOver={e => e.preventDefault()}
        onDrop={onDrop}
        onMouseEnter={() => setHovered('palette-upload')}
        onMouseLeave={() => setHovered(null)}
        className="relative overflow-hidden rounded-xl border border-dashed border-neutral-300 bg-neutral-50 px-4 py-6 text-center transition-colors hover:border-neutral-400 hover:bg-neutral-100/60 dark:border-neutral-700 dark:bg-neutral-800/40 dark:hover:border-neutral-600 dark:hover:bg-neutral-800/60"
      >
        {thumb ? (
          <div className="flex items-center justify-center gap-3">
            <img
              src={thumb}
              alt="所选图片"
              className="h-12 w-12 rounded-lg object-cover ring-1 ring-neutral-200 dark:ring-neutral-700"
            />
            <div className="text-left">
              <p className="text-[12.5px] font-medium text-neutral-700 dark:text-neutral-200">
                {extracting ? '正在分析像素…' : '已选取图片'}
              </p>
              <p className="text-[11px] text-neutral-400 dark:text-neutral-500">
                点击重新选择 · 或拖入新图片
              </p>
            </div>
          </div>
        ) : (
          <>
            <Upload className="mx-auto mb-2 h-5 w-5 text-neutral-400" />
            <p className="text-[12.5px] text-neutral-600 dark:text-neutral-300">
              拖入图片，或
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="ml-1 font-medium text-neutral-900 underline-offset-2 hover:underline dark:text-neutral-100"
              >
                点击选择
              </button>
            </p>
            <p className="mt-1 text-[11px] text-neutral-400 dark:text-neutral-500">
              智能算法提取主色调，应用到界面品牌元素
            </p>
          </>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={onPick}
          className="hidden"
        />
      </div>

      {/* Extracted swatch */}
      <AnimatePresence>
        {preview && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0, transition: MOTION.enter }}
            exit={{ opacity: 0, y: 6, transition: MOTION.enter }}
            className="flex items-center gap-3 rounded-xl border border-neutral-200 px-4 py-3 dark:border-neutral-800"
          >
            <div
              className="h-10 w-10 shrink-0 rounded-lg shadow-inner"
              style={{ backgroundColor: preview.hex }}
            />
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-medium text-neutral-700 dark:text-neutral-200">
                提取到的主色
              </p>
              <p className="text-[11px] uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                {preview.hex}
              </p>
            </div>
            <button
              type="button"
              onClick={apply}
              className="flex items-center gap-1 rounded-lg bg-neutral-900 px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
            >
              <Check className="h-3.5 w-3.5" />
              应用
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {error && (
        <p className="text-[11.5px] text-red-500 dark:text-red-400">{error}</p>
      )}

      {/* Current accent + reset */}
      <div
        onMouseEnter={() => hasAccent && setHovered('palette-reset')}
        onMouseLeave={() => setHovered(null)}
        className="flex items-center justify-between rounded-xl border border-neutral-200 px-4 py-3 transition-colors hover:border-neutral-300 dark:border-neutral-800 dark:hover:border-neutral-700"
      >
        <div className="flex items-center gap-2.5">
          <div
            className="h-6 w-6 rounded-md ring-1 ring-neutral-200 dark:ring-neutral-700"
            style={{ backgroundColor: accentColor ?? 'var(--brand)' }}
          />
          <div>
            <p className="text-[12.5px] font-medium text-neutral-700 dark:text-neutral-200">
              {hasAccent ? '当前主题色' : '默认中性配色'}
            </p>
            <p className="text-[11px] text-neutral-400 dark:text-neutral-500">
              {hasAccent ? accentColor : '未自定义 · 点击应用提取色'}
            </p>
          </div>
        </div>
        {hasAccent && (
          <button
            type="button"
            onClick={reset}
            className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            重置
          </button>
        )}
      </div>
    </div>
  );
}

// ─── About Tab ─────────────────────────────────────────────────────────────

function AboutTab() {
  const { setHovered } = useHint();
  const rows: { k: string; v: string; hint: string }[] = [
    { k: '版本', v: 'v1.2.0', hint: 'about-version' },
    { k: '框架', v: 'Next.js 16 · TypeScript', hint: 'about-stack' },
    { k: '主题色', v: '可自定义 · 见「配色」', hint: 'about-accent' },
  ];
  return (
    <div className="space-y-5">
      <SectionLabel title="关于" hint="MindGuide" />
      <div className="rounded-xl border border-neutral-200 px-4 py-4 dark:border-neutral-800">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--brand)] text-[var(--brand-foreground)]">
            <GraduationCap className="h-5 w-5" strokeWidth={1.6} />
          </div>
          <div>
            <p className="font-serif text-[15px] font-medium tracking-tight text-neutral-900 dark:text-neutral-100">
              MindGuide
            </p>
            <p className="text-[11px] text-neutral-400 dark:text-neutral-500">AI 对话式学习平台</p>
          </div>
        </div>
        <p className="mt-3 text-[12px] leading-relaxed text-neutral-500 dark:text-neutral-400">
          输入学习主题，AI 以苏格拉底式追问引导你主动建构知识；自动生成结构化课程、知识图谱与间隔重复卡片。
        </p>
      </div>
      <div className="space-y-1.5">
        {rows.map(r => (
          <div
            key={r.k}
            onMouseEnter={() => setHovered(r.hint)}
            onMouseLeave={() => setHovered(null)}
            className="flex items-center justify-between rounded-lg px-3 py-2 text-[12px] text-neutral-500 transition-colors hover:bg-neutral-50 dark:text-neutral-400 dark:hover:bg-neutral-800/50"
          >
            <span>{r.k}</span>
            <span className="text-neutral-700 dark:text-neutral-300">{r.v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Right Preview Pane ────────────────────────────────────────────────────
// The creative core. Two layers of retargeting:
//   1. active tab → a default hint for that tab (shown when nothing hovered)
//   2. hovered sub-item → that item's hint, cross-faded in
// The hint content follows the portfolio-card reference structure: a kicker, a
// serif title, a "Currently" bullet list, an optional note, plus a small demo
// widget that reflects the hint's domain (theme swatch / motion pulse / layout
// mock / palette flow). A brand mark stays pinned ~1/4 from the top-right.

function SettingsPreview({ activeTab }: { activeTab: TabKey }) {
  const { hovered } = useHint();
  const { accentColor } = usePreferences();
  const { resolvedTheme } = useTheme();
  const mounted = useSyncExternalStore(emptySubscribe, getTrue, getFalse);
  const isDark = mounted && resolvedTheme === 'dark';

  // Hovered wins; fall back to the active tab's default hint.
  const fallbackId = `tab-${activeTab}` as const;
  const activeId = hovered ?? fallbackId;
  const hint = hintMap[activeId] ?? hintMap[fallbackId];
  const DemoIcon = hint.icon ?? GraduationCap;

  return (
    <div className="relative flex w-[42%] flex-col bg-neutral-50 dark:bg-neutral-950/40">
      {/* Demo mark — pinned ~1/4 from the top, right-aligned. Its bg is the
          live brand accent, so 配色 changes are visible here instantly. The
          icon swaps to match the current hint (Sun/Moon/Zap/…). */}
      <div className="flex justify-end px-6 pt-12">
        <motion.div
          layout
          className="flex h-14 w-14 items-center justify-center rounded-2xl shadow-sm ring-1 ring-black/5"
          style={{ backgroundColor: 'var(--brand)', color: 'var(--brand-foreground)' }}
        >
          <AnimatePresence mode="wait">
            <motion.span
              key={(hint.icon as { displayName?: string } | undefined)?.displayName ?? 'default'}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1, transition: MOTION.enterSnappy }}
              exit={{ opacity: 0, scale: 0.8, transition: MOTION.enterSnappy }}
            >
              <DemoIcon className="h-7 w-7" strokeWidth={1.6} />
            </motion.span>
          </AnimatePresence>
        </motion.div>
      </div>

      {/* Structured hint content — cross-fades when the hovered item changes. */}
      <div className="custom-scrollbar flex-1 overflow-y-auto px-6 pt-6 pb-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeId}
            variants={hintVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-neutral-400 dark:text-neutral-600">
              {hint.kicker}
            </p>
            <h3 className="mt-1.5 font-serif text-[20px] font-medium tracking-tight text-neutral-800 dark:text-neutral-100">
              {hint.title}
            </h3>
            <p className="mt-1 text-[12px] leading-relaxed text-neutral-500 dark:text-neutral-400">
              {hint.subtitle}
            </p>

            {/* Currently — the reference image's signature bulleted list. */}
            <div className="mt-5">
              <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-neutral-400 dark:text-neutral-600">
                Currently
              </p>
              <ul className="space-y-1.5">
                {hint.currently.map((c, i) => (
                  <motion.li
                    key={c}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.05 + i * 0.05, duration: 0.2 }}
                    className="flex items-start gap-2 text-[12px] leading-relaxed text-neutral-600 dark:text-neutral-300"
                  >
                    <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[var(--brand)]" />
                    <span>{c}</span>
                  </motion.li>
                ))}
              </ul>
            </div>

            {/* Note — the "previously" paragraph. */}
            {hint.note && (
              <div className="mt-5">
                <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-neutral-400 dark:text-neutral-600">
                  Note
                </p>
                <p className="text-[11.5px] leading-relaxed text-neutral-500 dark:text-neutral-400">
                  {hint.note}
                </p>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Mini demo widget — domain-specific, reflects the hint's demo kind. */}
      <div className="px-6 pb-6">
        <HintDemo kind={hint.demo} accent={accentColor} isDark={isDark} />
      </div>

      {/* Watermark icon — a faint Palette mark in the bottom-left for visual
          balance with the top-right demo mark. */}
      <Palette className="pointer-events-none absolute bottom-5 left-5 h-4 w-4 text-neutral-200 dark:text-neutral-800" />
    </div>
  );
}

// ─── Hint demo widgets ─────────────────────────────────────────────────────
// A small, domain-specific visualization that anchors the abstract hint text.
// Each kind renders a different tiny scene so the right pane feels alive and
// relevant to whatever the user is hovering.

function HintDemo({
  kind,
  accent,
  isDark,
}: {
  kind: DemoKind;
  accent: string | null;
  isDark: boolean;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-3.5 dark:border-neutral-800 dark:bg-neutral-900">
      <AnimatePresence mode="wait">
        <motion.div
          key={kind}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0, transition: MOTION.enterSnappy }}
          exit={{ opacity: 0, y: 6, transition: MOTION.enterSnappy }}
        >
          {kind === 'theme-swatch' && <ThemeSwatchDemo isDark={isDark} />}
          {kind === 'motion' && <MotionDemo />}
          {kind === 'layout-mock' && <LayoutMockDemo />}
          {kind === 'palette-flow' && <PaletteFlowDemo accent={accent} />}
          {kind === 'about-card' && <AboutCardDemo />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function ThemeSwatchDemo({ isDark }: { isDark: boolean }) {
  // Three tiles: light / dark / the active one — shows the contrast the user
  // is choosing between.
  const tiles = [
    { label: '浅色', bg: '#ffffff', fg: '#0a0a0a', active: !isDark },
    { label: '深色', bg: '#171717', fg: '#fafafa', active: isDark },
  ];
  return (
    <div>
      <p className="mb-2 text-[10px] uppercase tracking-[0.14em] text-neutral-400 dark:text-neutral-600">
        对比
      </p>
      <div className="grid grid-cols-2 gap-2">
        {tiles.map(t => (
          <div
            key={t.label}
            className={`flex h-12 items-center justify-between rounded-lg px-2.5 ring-1 transition-all ${
              t.active ? 'ring-neutral-900 dark:ring-neutral-200' : 'ring-neutral-200 dark:ring-neutral-800'
            }`}
            style={{ backgroundColor: t.bg, color: t.fg }}
          >
            <span className="text-[10px] font-medium">{t.label}</span>
            <span className="h-1.5 w-6 rounded-full" style={{ backgroundColor: t.fg, opacity: 0.5 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function MotionDemo() {
  // Two rows: "动画" shows a traveling dot that loops; "静态" shows a fixed
  // dot. Makes the on/off difference tangible.
  return (
    <div>
      <p className="mb-2 text-[10px] uppercase tracking-[0.14em] text-neutral-400 dark:text-neutral-600">
        动效示意
      </p>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="w-10 text-[10px] text-neutral-400">动画</span>
          <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
            <motion.div
              className="absolute top-0 h-2 w-2 rounded-full bg-[var(--brand)]"
              animate={{ left: ['0%', 'calc(100% - 8px)', '0%'] }}
              transition={{ repeat: Infinity, duration: 2.4, ease: 'easeInOut' }}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-10 text-[10px] text-neutral-400">静态</span>
          <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
            <div className="absolute top-0 left-0 h-2 w-2 rounded-full bg-neutral-400 dark:bg-neutral-600" />
          </div>
        </div>
      </div>
    </div>
  );
}

function LayoutMockDemo() {
  // Three tiny wireframes: side / half / full, drawn with divs. The active
  // one (inferred from store) gets a brand ring — but to keep this widget
  // self-contained we just show all three as static illustrations.
  const mocks = [
    { label: '侧栏', els: [<aside key="s" className="mr-1 h-full w-1/4 rounded bg-neutral-200 dark:bg-neutral-700" />, <div key="c" className="h-full flex-1 rounded bg-neutral-100 dark:bg-neutral-800" />] },
    { label: '分屏', els: [<aside key="h" className="mr-1 h-full w-1/3 rounded bg-neutral-200 dark:bg-neutral-700" />, <div key="c" className="h-full flex-1 rounded bg-neutral-100 dark:bg-neutral-800" />] },
    { label: '全屏', els: [<div key="f" className="h-full w-full rounded bg-neutral-100 dark:bg-neutral-800" />] },
  ];
  return (
    <div>
      <p className="mb-2 text-[10px] uppercase tracking-[0.14em] text-neutral-400 dark:text-neutral-600">
        布局示意
      </p>
      <div className="grid grid-cols-3 gap-2">
        {mocks.map(m => (
          <div key={m.label}>
            <div className="flex h-10 rounded-md border border-neutral-200 p-1 dark:border-neutral-700">
              {m.els}
            </div>
            <p className="mt-1 text-center text-[9.5px] text-neutral-400 dark:text-neutral-600">{m.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function PaletteFlowDemo({ accent }: { accent: string | null }) {
  // A 3-step flow: 图片 → 提取 → 应用, with the accent tile showing the live
  // chosen color (or "—" for the neutral default).
  return (
    <div>
      <p className="mb-2 text-[10px] uppercase tracking-[0.14em] text-neutral-400 dark:text-neutral-600">
        取色流程
      </p>
      <div className="flex items-center gap-1.5">
        <div className="flex flex-1 flex-col items-center gap-1">
          <div className="flex h-9 w-full items-center justify-center rounded-md border border-neutral-200 dark:border-neutral-700">
            <ImageIcon className="h-4 w-4 text-neutral-400" />
          </div>
          <span className="text-[9.5px] text-neutral-400">图片</span>
        </div>
        <span className="text-neutral-300 dark:text-neutral-700">→</span>
        <div className="flex flex-1 flex-col items-center gap-1">
          <div className="flex h-9 w-full items-center justify-center rounded-md border border-neutral-200 dark:border-neutral-700">
            <Sparkles className="h-4 w-4 text-neutral-400" />
          </div>
          <span className="text-[9.5px] text-neutral-400">提取</span>
        </div>
        <span className="text-neutral-300 dark:text-neutral-700">→</span>
        <div className="flex flex-1 flex-col items-center gap-1">
          <div
            className="flex h-9 w-full items-center justify-center rounded-md ring-1 ring-neutral-200 dark:ring-neutral-700"
            style={{ backgroundColor: accent ?? 'var(--brand)' }}
          >
            <span className="text-[9px] font-medium" style={{ color: 'var(--brand-foreground)' }}>
              {accent ? '✓' : '—'}
            </span>
          </div>
          <span className="text-[9.5px] text-neutral-400">应用</span>
        </div>
      </div>
    </div>
  );
}

function AboutCardDemo() {
  return (
    <div>
      <p className="mb-2 text-[10px] uppercase tracking-[0.14em] text-neutral-400 dark:text-neutral-600">
        技术栈
      </p>
      <div className="flex flex-wrap gap-1.5">
        {['Next.js 16', 'TypeScript', 'Tailwind 4', 'Prisma', 'Tiptap', 'z-ai-sdk'].map(t => (
          <span
            key={t}
            className="rounded-md border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-[10px] text-neutral-500 dark:border-neutral-700 dark:bg-neutral-800/60 dark:text-neutral-400"
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Shared bits ───────────────────────────────────────────────────────────

function SectionLabel({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="mb-2.5 flex items-center gap-1.5">
      <span className="text-[13px] font-medium text-neutral-700 dark:text-neutral-200">{title}</span>
      <span className="text-[11px] text-neutral-400 dark:text-neutral-500">· {hint}</span>
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors duration-200 ${
        checked ? 'bg-neutral-900 dark:bg-neutral-100' : 'bg-neutral-200 dark:bg-neutral-700'
      }`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full shadow-sm transition-transform duration-200 ${
          checked ? 'translate-x-4 bg-white dark:bg-neutral-900' : 'translate-x-0.5 bg-white dark:bg-neutral-300'
        }`}
      />
    </button>
  );
}
