'use client';

import React, { useCallback, useRef, useState, useSyncExternalStore } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
// Layout intentionally mirrors a portfolio-card reference (left nav/list 60% +
// right preview 40%) the user liked: a single rounded container, a horizontal
// tab strip, and a darker preview pane on the right with a demo brand mark
// seated ~1/4 from the top-right corner.

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

const panelVariants = {
  hidden: { opacity: 0, scale: 0.96, y: 10 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 320, damping: 30, mass: 0.9 },
  },
  exit: { opacity: 0, scale: 0.97, y: 6, transition: { duration: 0.16, ease: [0.4, 0, 1, 1] } },
};

const contentVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.25, 0.1, 0.25, 1] } },
  exit: { opacity: 0, y: -4, transition: { duration: 0.12 } },
};

export function SettingsView() {
  const open = useLearningStore(s => s.settingsViewOpen);
  const setOpen = useLearningStore(s => s.setSettingsViewOpen);
  const [activeTab, setActiveTab] = useState<TabKey>('appearance');

  // Close on Escape.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.2 } }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-[3px]"
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
            className="fixed left-1/2 top-1/2 z-[61] flex h-[min(620px,88vh)] w-[min(960px,94vw)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-[0_24px_64px_-12px_rgba(0,0,0,0.22)] dark:border-neutral-700 dark:bg-neutral-900"
          >
            {/* ── Left: nav + content (≈60%) ── */}
            <div className="flex w-[58%] flex-col border-r border-neutral-200 dark:border-neutral-800">
              {/* Header — title row */}
              <div className="flex items-center justify-between px-6 pt-5 pb-3">
                <div className="flex items-center gap-2">
                  <span className="font-serif text-[18px] font-medium tracking-tight text-neutral-900 dark:text-neutral-100">
                    设置
                  </span>
                  <span className="text-[11px] text-neutral-400 dark:text-neutral-500">· Settings</span>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="关闭"
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-200 text-white transition-transform hover:scale-105 dark:bg-neutral-700"
                >
                  <X className="h-3.5 w-3.5" strokeWidth={2.5} />
                </button>
              </div>

              {/* Tab strip — horizontal, pill-style like Work/Ideas/Contact */}
              <div className="flex gap-1 px-6 pb-3">
                {tabs.map(t => {
                  const selected = activeTab === t.key;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setActiveTab(t.key)}
                      className={`rounded-lg px-3.5 py-1.5 text-[12.5px] font-medium transition-colors duration-200 ${
                        selected
                          ? 'bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100'
                          : 'text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200'
                      }`}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>

              <div className="mx-6 h-px bg-neutral-100 dark:bg-neutral-800" />

              {/* Content — scrollable */}
              <div className="custom-scrollbar flex-1 overflow-y-auto px-6 py-5">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeTab}
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

            {/* ── Right: preview pane (≈40%) ── */}
            <SettingsPreview activeTab={activeTab} />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─── Appearance Tab ────────────────────────────────────────────────────────

function AppearanceTab() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const { motionEnabled, setMotionEnabled } = usePreferences();
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
        <div className="flex items-start justify-between gap-3 rounded-xl border border-neutral-200 px-4 py-3 dark:border-neutral-800">
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
        className="relative overflow-hidden rounded-xl border border-dashed border-neutral-300 bg-neutral-50 px-4 py-6 text-center transition-colors dark:border-neutral-700 dark:bg-neutral-800/40"
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
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
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
      <div className="flex items-center justify-between rounded-xl border border-neutral-200 px-4 py-3 dark:border-neutral-800">
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
        {[
          ['版本', 'v1.1.0'],
          ['框架', 'Next.js 16 · TypeScript'],
          ['主题色', '可自定义 · 见「配色」'],
        ].map(([k, v]) => (
          <div
            key={k}
            className="flex items-center justify-between rounded-lg px-3 py-2 text-[12px] text-neutral-500 dark:text-neutral-400"
          >
            <span>{k}</span>
            <span className="text-neutral-700 dark:text-neutral-300">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Right Preview Pane ────────────────────────────────────────────────────
// Mirrors the reference's right "preview" pane. A demo brand mark sits ~1/4
// from the top-right corner; its background reflects the live accent so the
// user sees the effect of their 配色 choice immediately.

function SettingsPreview({ activeTab }: { activeTab: TabKey }) {
  const { resolvedTheme } = useTheme();
  const mounted = useSyncExternalStore(emptySubscribe, getTrue, getFalse);
  const isDark = mounted && resolvedTheme === 'dark';
  const { accentColor } = usePreferences();
  const displayMode = useLearningStore(s => s.displayMode);

  const tabLabel = tabs.find(t => t.key === activeTab)?.label ?? '';

  return (
    <div className="relative flex w-[42%] flex-col bg-neutral-50 dark:bg-neutral-950/40">
      {/* Demo mark — seated ~1/4 from the top, right-aligned. Its bg is the
          live brand accent, so 配色 changes are visible here instantly. */}
      <div className="flex justify-end px-6 pt-12">
        <motion.div
          layout
          className="flex h-14 w-14 items-center justify-center rounded-2xl shadow-sm ring-1 ring-black/5"
          style={{ backgroundColor: 'var(--brand)', color: 'var(--brand-foreground)' }}
        >
          <GraduationCap className="h-7 w-7" strokeWidth={1.6} />
        </motion.div>
      </div>

      {/* Live state caption */}
      <div className="px-6 pt-6">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-600">
          预览 · {tabLabel}
        </p>
        <p className="mt-1.5 font-serif text-[16px] tracking-tight text-neutral-700 dark:text-neutral-200">
          {activeTab === 'appearance' && (isDark ? '深色模式' : '浅色模式')}
          {activeTab === 'layout' && layoutOptions.find(o => o.value === displayMode)?.label}
          {activeTab === 'palette' && (accentColor ? '自定义主题色' : '默认中性配色')}
          {activeTab === 'about' && 'MindGuide'}
        </p>
        <p className="mt-1 text-[11.5px] leading-relaxed text-neutral-400 dark:text-neutral-500">
          {activeTab === 'appearance' && '主题与动态效果将应用于整个界面'}
          {activeTab === 'layout' && '调整侧边栏与内容的显示比例'}
          {activeTab === 'palette' && '上传图片，提取主色作为品牌强调色'}
          {activeTab === 'about' && 'AI 对话式学习平台'}
        </p>
      </div>

      {/* Mini mock — a tiny representation of the app using the accent */}
      <div className="mt-auto px-6 pb-6">
        <div className="rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="mb-2 flex items-center gap-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-neutral-300 dark:bg-neutral-700" />
            <div className="h-1.5 w-8 rounded-full bg-neutral-200 dark:bg-neutral-700" />
          </div>
          <div className="mb-2 h-1.5 w-3/4 rounded-full bg-neutral-100 dark:bg-neutral-800" />
          <div className="mb-3 h-1.5 w-1/2 rounded-full bg-neutral-100 dark:bg-neutral-800" />
          <div
            className="flex h-6 w-16 items-center justify-center rounded-md text-[10px] font-medium"
            style={{ backgroundColor: 'var(--brand)', color: 'var(--brand-foreground)' }}
          >
            开始
          </div>
        </div>
        <p className="mt-2 text-center text-[10px] uppercase tracking-[0.16em] text-neutral-300 dark:text-neutral-700">
          {accentColor ? accentColor : 'monochrome'}
        </p>
      </div>

      {/* Watermark icon — a faint Palette mark in the bottom-left for visual
          balance with the top-right demo mark. */}
      <Palette className="pointer-events-none absolute bottom-5 left-5 h-4 w-4 text-neutral-200 dark:text-neutral-800" />
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
