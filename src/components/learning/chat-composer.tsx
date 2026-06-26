'use client';

// ─── Chat Composer — monochrome, single-row toolbar ─────────────────────────
//
// Layout (matches the user's reference screenshot):
//
//   ┌──────────────────────────────────────────────────────────────────────┐
//   │  textarea                                                            │
//   ├──────────────────────────────────────────────────────────────────────┤
//   │ [+] [引导模式▾]              [GLM-4.6 · 14k▾] [思考▾] [↑]            │
//   │                                                                      │
//   │   ↵ 发送 · ⇧↵ 换行                                       清空        │
//   └──────────────────────────────────────────────────────────────────────┘
//
// Left  : + (add file)  +  引导模式 selector
// Right : ModelCard (model name + usage meters + switcher) → 思考 selector → send
// The bottom row carries the tiny keyboard hint + clear affordance.
//
// Design rules (per user spec):
//   • Monochrome neutral palette — NO amber / blue / green. Selected/active
//     states use solid neutral-800 (light) / neutral-200 (dark) so the chip
//     reads as a filled grey token, not a harsh black/white block.
//   • NO emoji anywhere — only lucide-react line icons or hand-drawn SVG.
//   • Thinking levels (off / standard / deep / structured) still drive the
//     API `thinking` config + reasoning-style overlay; their animations live
//     in StatusBackCard + main-content's thread bubble.

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowUp,
  Square,
  Plus,
  FileText,
  BookMarked,
  Image as ImageIcon,
  Link2,
  StickyNote,
  Compass,
  GraduationCap,
  Dumbbell,
  RotateCw,
  Check,
  X,
  BrainCircuit,
  Zap,
  ZapOff,
  Network,
  Cpu,
  Gauge,
  Layers,
  CircleDot,
  Eraser,
  Maximize2,
  Code2,
} from 'lucide-react';
import { useLearningStore } from '@/store/learning-store';
import { MouseFollowTooltip } from '@/components/learning/mouse-follow-tooltip';

// ─── Types ───────────────────────────────────────────────────────────────────

type TeachingMode = 'guide' | 'explain' | 'practice' | 'review';
type ThinkingMode = 'off' | 'standard' | 'deep' | 'structured';
type SelectedModel = 'GLM-4.6' | 'GLM-4.5' | 'GLM-4-Air';

type IconType = React.ComponentType<{ className?: string; strokeWidth?: number }>;

interface AttachmentOption {
  key: string;
  label: string;
  desc: string;
  icon: IconType;
}

interface ModeOption {
  key: TeachingMode;
  label: string;
  desc: string;
  icon: IconType;
}

interface ThinkingOption {
  key: ThinkingMode;
  label: string;
  short: string;
  desc: string;
  icon: IconType;
}

interface ModelOption {
  key: SelectedModel;
  label: string;
  desc: string;
  contextWindow: number; // tokens
  icon?: IconType;
}

const ATTACH_OPTIONS: AttachmentOption[] = [
  { key: 'file', label: '添加文件', desc: 'PDF / Word / Markdown 等学习材料', icon: FileText },
  { key: 'knowledge', label: '知识库', desc: '引用本会话已上传的材料段落', icon: BookMarked },
  { key: 'image', label: '添加图片', desc: '截图或公式图片，让 AI 识别', icon: ImageIcon },
  { key: 'link', label: '添加链接', desc: '网页 URL，自动抓取正文', icon: Link2 },
  { key: 'note', label: '添加笔记', desc: '引用你的学习笔记片段', icon: StickyNote },
];

const MODE_OPTIONS: ModeOption[] = [
  { key: 'guide', label: '引导模式', desc: '苏格拉底式提问，让你自己想通', icon: Compass },
  { key: 'explain', label: '讲解模式', desc: '直接、完整地把概念讲透', icon: GraduationCap },
  { key: 'practice', label: '练习模式', desc: '出题让你动手试，再给反馈', icon: Dumbbell },
  { key: 'review', label: '复习模式', desc: '间隔出题，检验已学知识', icon: RotateCw },
];

// Four thinking levels — each maps to API `thinking` config + an additive
// reasoning-style prompt overlay (see THINK_OVERLAYS in chat route). The icon
// and the reasoning animation in StatusBackCard are chosen per-level.
const THINK_OPTIONS: ThinkingOption[] = [
  {
    key: 'off',
    label: '关闭思考',
    short: '思考',
    desc: '不启用深度推理，最快给出直接答案',
    icon: ZapOff,
  },
  {
    key: 'standard',
    label: '标准思考',
    short: '思考',
    desc: '模型内置深度推理，回答更周全',
    icon: Zap,
  },
  {
    key: 'deep',
    label: '深度推理',
    short: '思考',
    desc: '多角度 + 反例 + 边界检验，严谨全面',
    icon: BrainCircuit,
  },
  {
    key: 'structured',
    label: '结构化推理',
    short: '思考',
    desc: '链式推理 → 自我批评 → 多路径收敛',
    icon: Network,
  },
];

const MODEL_OPTIONS: ModelOption[] = [
  { key: 'GLM-4.6', label: 'GLM-4.6', desc: '最新旗舰 · 推理与长文本均衡', contextWindow: 200_000 },
  { key: 'GLM-4.5', label: 'GLM-4.5', desc: '稳定可靠 · 日常学习场景', contextWindow: 128_000 },
  { key: 'GLM-4-Air', label: 'GLM-4-Air', desc: '轻量高速 · 短问答与速记', contextWindow: 128_000 },
];

const MODEL_BUDGET = 200_000; // visualization budget for the model-usage meter

// ─── Popover hook (click-outside + escape + auto-flip) ──────────────────────
//
// The trigger button lives inside the composer card, but its menu renders at
// the wrapper level (so it can pop OUTWARD above the card without being
// clipped by the card's overflow-hidden). To keep click-outside working we
// track TWO refs: `ref` on the trigger wrapper + `menuRef` on the floating
// menu — a press inside either is treated as "inside" and won't dismiss.
//
// AUTO-FLIP: when the menu opens we measure how much vertical space is
// available above vs below the trigger. If there isn't enough room ABOVE
// (the default direction — menus pop upward from a bottom-docked composer),
// we flip the menu to open DOWNWARD instead, inside the composer card. This
// prevents the menu from being pushed off-screen when the textarea is tall
// (expanded mode) or the viewport is short.

function usePopover() {
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<'up' | 'down'>('up');
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // On open, measure available space and pick a direction. We re-measure on
  // every open (not just once) so window resize / textarea expansion between
  // opens is handled.
  useEffect(() => {
    if (!open) return;
    const trigger = ref.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;
    // Need at least 260px (a typical menu height) to open in that direction.
    // Prefer 'up' (default for a bottom-docked composer) but flip to 'down'
    // if there's not enough room above AND there's more room below.
    // Deferred to a microtask so we don't call setState synchronously inside
    // this effect (react-hooks/set-state-in-effect rule).
    const next: 'up' | 'down' = spaceAbove < 260 && spaceBelow > spaceAbove ? 'down' : 'up';
    queueMicrotask(() => setDirection(next));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return { open, setOpen, ref, menuRef, direction };
}

// ─── Main Composer ───────────────────────────────────────────────────────────

export interface ChatComposerProps {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  isStreaming: boolean;
  /** True while the model is in its pre-token "thinking" phase — drives the
   * layered status back card above the composer. */
  isThinking?: boolean;
  placeholder?: string;
}

export function ChatComposer({
  value,
  onChange,
  onSend,
  onStop,
  isStreaming,
  isThinking = false,
  placeholder = '问我任何学习上的问题…',
}: ChatComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const teachingMode = useLearningStore(s => s.teachingMode);
  const setTeachingMode = useLearningStore(s => s.setTeachingMode);
  const thinkingMode = useLearningStore(s => s.thinkingMode);
  const setThinkingMode = useLearningStore(s => s.setThinkingMode);
  const selectedModel = useLearningStore(s => s.selectedModel);
  const setSelectedModel = useLearningStore(s => s.setSelectedModel);
  const modelUsageTokens = useLearningStore(s => s.modelUsageTokens);
  const setCreateNewPanelOpen = useLearningStore(s => s.setCreateNewPanelOpen);

  // Destructure popover state into plain locals — the `react-hooks/refs` rule
  // flags property access off any object that also carries a ref, so we pull
  // `open`/`setOpen`/`ref`/`menuRef` out as independent names.
  const { open: attachOpen, setOpen: setAttachOpen, ref: attachRef, menuRef: attachMenuRef, direction: attachDir } = usePopover();
  const { open: modeOpen, setOpen: setModeOpen, ref: modeRef, menuRef: modeMenuRef } = usePopover();
  const { open: thinkOpen, setOpen: setThinkOpen, ref: thinkRef, menuRef: thinkMenuRef, direction: thinkDir } = usePopover();
  const { open: modelOpen, setOpen: setModelOpen, ref: modelRef, menuRef: modelMenuRef, direction: modelDir } = usePopover();

  // ── Confirmation toast on mode/model/thinking switch ──
  // Settings changes have no immediate visible effect, so a brief inline
  // toast naming the new value closes the feedback loop within ~1.5s.
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevTeaching = useRef(teachingMode);
  const prevThinking = useRef(thinkingMode);
  const prevModel = useRef(selectedModel);
  useEffect(() => {
    const messages: string[] = [];
    if (teachingMode !== prevTeaching.current) {
      const m = MODE_OPTIONS.find(o => o.key === teachingMode);
      messages.push(`教学模式：${m?.label || teachingMode}`);
      prevTeaching.current = teachingMode;
    }
    if (thinkingMode !== prevThinking.current) {
      const m = THINK_OPTIONS.find(o => o.key === thinkingMode);
      messages.push(`思考：${m?.label || thinkingMode}`);
      prevThinking.current = thinkingMode;
    }
    if (selectedModel !== prevModel.current) {
      messages.push(`模型：${selectedModel}`);
      prevModel.current = selectedModel;
    }
    if (messages.length > 0) {
      const msg = messages.join(' · ');
      // Deferred to a microtask so we don't call setState synchronously inside
      // this effect (react-hooks/set-state-in-effect rule).
      queueMicrotask(() => setToast(msg));
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => queueMicrotask(() => setToast(null)), 1800);
    }
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [teachingMode, thinkingMode, selectedModel]);

  // Context tokens embedded in the draft (e.g. `@[知识库]` `@[添加图片]`) —
  // these are the "imported files / context" the status back card surfaces.
  // Parsing them at render time keeps the chip list in sync with the textarea
  // without a separate attachment store.
  const contextTokens = useMemo(() => {
    const matches = value.match(/@\[([^\]]+)\]/g) || [];
    return matches.map(m => m.slice(2, -1));
  }, [value]);

  const handleRemoveToken = useCallback(
    (label: string) => {
      onChange(value.replace(`@[${label}]`, '').replace(/[ \t]{2,}/g, ' ').replace(/^\s+/, '').trimEnd());
      requestAnimationFrame(() => textareaRef.current?.focus());
    },
    [value, onChange]
  );

  // Auto-resize with smooth collapse — the textarea grows to fit content up to
  // a tiered max, and COLLAPSES smoothly when text is cleared (e.g. after
  // send). Two tiers:
  //   • default  — min 1 line, grows to ~6 lines (compact mode)
  //   • expanded — user clicked "展开" to get a taller editor (~14 lines)
  // The height transition is animated via the `transition-[height]` class on
  // the textarea, so when value shrinks (send / clear) the box eases back to
  // min instead of snapping. We reset to compact mode whenever the draft is
  // emptied so the next message starts fresh.
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const maxH = expanded ? 320 : 140;
    el.style.height = `${Math.min(el.scrollHeight, maxH)}px`;
    // When the draft is cleared, drop back to compact mode for next message.
    // Deferred to a microtask so we don't call setState synchronously inside
    // this effect (which would trigger a cascading re-render per the
    // react-hooks/set-state-in-effect rule).
    if (value === '' && expanded) {
      queueMicrotask(() => setExpanded(false));
    }
  }, [value, expanded]);

  // ── Attention-focus state machine ──
  // hint visibility by scene:
  //   idle / focused-empty → show
  //   typing / selecting / cursor-moving → hide
  //   focused-idle (>2s no key) → dim (45% opacity)
  // 180ms debounce prevents flicker. 300ms poll while focused catches idle +
  // selection transitions that don't fire key events.
  type AttentionScene = 'idle' | 'focused-empty' | 'typing' | 'focused-idle' | 'selecting' | 'cursor-moving';
  const [scene, setScene] = useState<AttentionScene>('idle');
  const lastKeyAt = useRef<number>(0);
  const lastCursorMoveAt = useRef<number>(0);
  const hasSelection = useRef<boolean>(false);
  const sceneDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleScene = useCallback((next: AttentionScene) => {
    if (sceneDebounce.current) clearTimeout(sceneDebounce.current);
    sceneDebounce.current = setTimeout(() => {
      queueMicrotask(() => setScene(prev => (prev === next ? prev : next)));
    }, 180);
  }, []);

  useEffect(() => {
    if (!isFocused) {
      scheduleScene('idle');
      return;
    }
    const iv = setInterval(() => {
      const now = Date.now();
      const sinceKey = now - lastKeyAt.current;
      const sinceCursor = now - lastCursorMoveAt.current;
      const el = textareaRef.current;
      const sel = el ? el.selectionStart !== el.selectionEnd : false;
      hasSelection.current = sel;

      if (sel) {
        scheduleScene('selecting');
      } else if (sinceCursor < 800) {
        scheduleScene('cursor-moving');
      } else if (value.length === 0) {
        scheduleScene('focused-empty');
      } else if (sinceKey < 1200) {
        scheduleScene('typing');
      } else if (sinceKey > 2000) {
        scheduleScene('focused-idle');
      } else {
        scheduleScene('typing');
      }
    }, 300);
    return () => clearInterval(iv);
  }, [isFocused, value.length, scheduleScene]);

  useEffect(() => {
    return () => {
      if (sceneDebounce.current) clearTimeout(sceneDebounce.current);
    };
  }, []);

  const hintVisibility: 'show' | 'dim' | 'hide' =
    scene === 'idle' || scene === 'focused-empty'
      ? 'show'
      : scene === 'focused-idle'
        ? 'dim'
        : 'hide';

  // ── Scene-aware suggestion chips ──
  // Contextual action chips surface in the left-bottom corner based on input
  // patterns. Priority: pause > expand > deep-think > code.
  // Replaces the keyboard hint in the same position; auto-dismisses after 6s.
  type SceneChip = 'pause' | 'expand' | 'deep-think' | 'code' | null;
  const [sceneChip, setSceneChip] = useState<SceneChip>(null);
  const chipDismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let next: SceneChip = null;
    if (isStreaming && value.trim().length > 0) {
      next = 'pause';
    } else if (value.length > 280 && !expanded) {
      next = 'expand';
    } else if (/[?？]\s*$/.test(value.trim()) && value.length > 4) {
      next = 'deep-think';
    } else if (/```|\n    \S/.test(value)) {
      next = 'code';
    }

    if (next !== sceneChip) {
      queueMicrotask(() => setSceneChip(next));
      if (next !== null) {
        if (chipDismissTimer.current) clearTimeout(chipDismissTimer.current);
        chipDismissTimer.current = setTimeout(() => {
          queueMicrotask(() => setSceneChip(null));
        }, 6000);
      }
    }
  }, [value, isStreaming, expanded, sceneChip]);

  useEffect(() => {
    return () => {
      if (chipDismissTimer.current) clearTimeout(chipDismissTimer.current);
    };
  }, []);

  const handleSceneChipClick = useCallback((chip: Exclude<SceneChip, null>) => {
    if (chip === 'pause' && isStreaming) {
      onStop();
    } else if (chip === 'expand') {
      queueMicrotask(() => setExpanded(true));
    } else if (chip === 'deep-think') {
      setThinkingMode('deep');
      const t = THINK_OPTIONS.find(o => o.key === 'deep');
      if (t) {
        queueMicrotask(() => setToast(`思考：${t.label}`));
      }
    } else if (chip === 'code') {
      queueMicrotask(() => setToast('代码模式（即将推出）'));
    }
    queueMicrotask(() => setSceneChip(null));
    if (chipDismissTimer.current) clearTimeout(chipDismissTimer.current);
  }, [isStreaming, onStop, setThinkingMode]);

  // ── Long-press Backspace → morph left-bottom hint into "清空全部内容" ──
  // Hold Backspace >600ms while text exists → swap the hint position into a
  // clear-all button. Same corner, contextual clear action.
  // Lifecycle: keydown starts timer; keyup cancels pending (keeps visible if
  // fired); click clears text; 4s auto-dismiss; empty text un-morphs.
  const backspaceDownAt = useRef<number | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const morphDismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [morphToClear, setMorphToClear] = useState(false);

  // Auto-dismiss the morph after 4s (user didn't click — they changed their mind).
  useEffect(() => {
    if (!morphToClear) return;
    morphDismissTimer.current = setTimeout(() => {
      queueMicrotask(() => setMorphToClear(false));
    }, 4000);
    return () => {
      if (morphDismissTimer.current) clearTimeout(morphDismissTimer.current);
    };
  }, [morphToClear]);

  // Un-morph once text is empty (the clear action completed, or was never needed).
  useEffect(() => {
    if (morphToClear && value.length === 0) {
      queueMicrotask(() => setMorphToClear(false));
    }
  }, [value, morphToClear]);

  useEffect(() => {
    return () => {
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
      if (morphDismissTimer.current) clearTimeout(morphDismissTimer.current);
    };
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      lastKeyAt.current = Date.now();
      // Cursor-moving keys → cursor-moving scene (hint hides).
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) {
        lastCursorMoveAt.current = Date.now();
        scheduleScene('cursor-moving');
      } else if (e.key !== 'Shift' && e.key !== 'Control' && e.key !== 'Alt' && e.key !== 'Meta') {
        // Real input keys (excl. modifiers) → typing scene.
        scheduleScene('typing');
      }

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (value.trim() && !isStreaming) onSend();
        return;
      }
      // Long-press Backspace → start 600ms morph timer.
      if (e.key === 'Backspace' && value.length > 0 && backspaceDownAt.current === null) {
        backspaceDownAt.current = Date.now();
        if (longPressTimer.current) clearTimeout(longPressTimer.current);
        longPressTimer.current = setTimeout(() => {
          queueMicrotask(() => setMorphToClear(true));
        }, 600);
      }
    },
    [value, isStreaming, onSend, scheduleScene]
  );

  const handleKeyUp = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Backspace') {
      backspaceDownAt.current = null;
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
      // Note: we do NOT immediately un-morph on keyup — the user just
      // triggered it, give them time to click. The 4s auto-dismiss handles
      // the case where they change their mind.
    }
  }, []);

  const handleClearAll = useCallback(() => {
    onChange('');
    queueMicrotask(() => setMorphToClear(false));
    if (morphDismissTimer.current) clearTimeout(morphDismissTimer.current);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [onChange]);

  const canSend = value.trim().length > 0 && !isStreaming;
  const charCount = value.length;
  // Visual context-used estimate — char count + a base overhead so the usage
  // meter shows progress even for short messages.
  const contextUsed = charCount + 8000;

  const activeMode = MODE_OPTIONS.find(m => m.key === teachingMode) || MODE_OPTIONS[0];
  const activeThink = THINK_OPTIONS.find(m => m.key === thinkingMode) || THINK_OPTIONS[1];
  const activeModel = MODEL_OPTIONS.find(m => m.key === selectedModel) || MODEL_OPTIONS[0];

  const handleAttach = useCallback(
    (opt: AttachmentOption) => {
      setAttachOpen(false);
      // For now, "file" opens the existing create-new panel (which has the
      // upload flow). Other attachment types are placeholders that insert a
      // mention token into the composer so the user sees the intent captured.
      if (opt.key === 'file') {
        setCreateNewPanelOpen(true);
        return;
      }
      const token = `@[${opt.label}] `;
      onChange(value + (value.endsWith(' ') || value === '' ? '' : ' ') + token);
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
        const el = textareaRef.current;
        if (el) {
          el.selectionStart = el.selectionEnd = el.value.length;
        }
      });
    },
    [setAttachOpen, setCreateNewPanelOpen, onChange, value]
  );

  return (
    <div className="relative flex flex-col">
      {/* ── Switch-confirmation toast (P8) — a tiny pill that fades in above
          the composer for ~1.8s after the user changes mode/model/thinking.
          Pure neutral, monochrome. Renders ABOVE the status back card so it
          never collides with thinking/context chips. ── */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 380, damping: 28 } }}
            exit={{ opacity: 0, y: 6, scale: 0.96, transition: { duration: 0.16 } }}
            className="pointer-events-none absolute -top-7 left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-full border border-neutral-200 bg-white px-2.5 py-0.5 text-[10.5px] font-medium text-neutral-700 shadow-md dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
            role="status"
            aria-live="polite"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Status back card — a layered shelf that pops up above the composer
          when the model is thinking or when the draft carries context tokens
          (imported files / knowledge / links). Visually it reads as a second
          card stacked behind the main input, its bottom edge tucked under the
          composer card's top border (mb-[-2px] + rounded-t-xl) so the pair
          reads as overlapping cards, not two separate bars. ── */}
      <StatusBackCard
        isThinking={isThinking}
        thinkingMode={thinkingMode}
        contextTokens={contextTokens}
        onRemoveToken={handleRemoveToken}
      />

      {/* ── Composer card ── */}
      <div
        className={`relative z-10 flex flex-col gap-1.5 overflow-hidden rounded-2xl border bg-white p-2 transition-colors dark:bg-neutral-900 ${
          isFocused
            ? 'border-neutral-300 dark:border-neutral-600'
            : 'border-neutral-200/80 hover:border-neutral-300 dark:border-neutral-800 dark:hover:border-neutral-700'
        }`}
      >
        {/* Textarea — real textarea for accessibility + IME reliability.
            Height is driven imperatively by the auto-resize effect above, but
            the `transition-[height]` class makes growth AND collapse smooth
            (collapse matters: after send/clear the box eases back to 1 line
            instead of snapping). Tiered max: 140px compact / 320px expanded. */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onKeyUp={handleKeyUp}
          onSelect={e => {
            // Track text selection for attention-focus: when the user selects
            // a range, transition to 'selecting' scene so the hint hides and
            // doesn't overlap the selection highlight. Fires on mousedrag
            // select, double-click word select, and Shift+arrow select.
            const el = e.currentTarget;
            const sel = el.selectionStart !== el.selectionEnd;
            hasSelection.current = sel;
            if (sel) scheduleScene('selecting');
          }}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={placeholder}
          disabled={isStreaming}
          rows={1}
          style={{ maxHeight: expanded ? 320 : 140 }}
          className="min-h-[36px] flex-1 resize-none border-0 bg-transparent px-1.5 py-0.5 text-[13px] leading-[1.55] text-neutral-800 caret-neutral-700 transition-[height] duration-200 ease-out placeholder:text-neutral-400 focus:outline-none disabled:opacity-60 dark:text-neutral-100 dark:caret-neutral-300 dark:placeholder:text-neutral-500"
        />
        {/* Expand / collapse toggle — appears once the draft is long enough
            that compact mode would scroll internally. Gives the user an
            explicit escape hatch for composing long messages. */}
        <AnimatePresence>
          {charCount > 280 && (
            <motion.button
              type="button"
              initial={{ opacity: 0, y: -2 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -2 }}
              onClick={() => setExpanded(e => !e)}
              className="absolute right-2 top-1.5 flex h-5 items-center gap-0.5 rounded border border-neutral-200 bg-white/90 px-1 text-[10px] text-neutral-500 backdrop-blur-sm transition-colors hover:bg-neutral-50 hover:text-neutral-700 dark:border-neutral-700 dark:bg-neutral-900/90 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
              aria-label={expanded ? '收起输入框' : '展开输入框'}
            >
              {expanded ? '收起' : '展开'}
            </motion.button>
          )}
        </AnimatePresence>

        {/* ── Bottom toolbar — balanced: flat config left, raised island right ──
            Left : + (attach) + 引导模式 + 模型文本 (flat config cluster, ~3/4)
            Right: 思考 + send (raised oval action island, ~1/4,
                  lifted above the flat baseline via -translate-y + shadow) */}
        <div className="flex items-center gap-1 sm:gap-1.5">
          {/* Left cluster — flat config: attach + mode + model text. */}
          <div className="flex min-w-0 items-center gap-1">
            {/* + 添加文件 — opens the attachment menu */}
            <div ref={attachRef} className="relative">
              <MouseFollowTooltip content="添加文件 / 上下文">
                <button
                  type="button"
                  onClick={() => setAttachOpen(o => !o)}
                  aria-label="添加文件"
                  aria-expanded={attachOpen}
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors sm:h-7 sm:w-7 ${
                    attachOpen
                      ? 'border-neutral-300 bg-neutral-100 text-neutral-900 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100'
                      : 'border-neutral-200 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-neutral-100'
                  }`}
                >
                  <Plus className="h-4 w-4" strokeWidth={2.2} />
                </button>
              </MouseFollowTooltip>
            </div>

            {/* 引导模式 selector — icon-only, hover tooltip, menu opens BESIDE (right) */}
            <div ref={modeRef} className="relative">
              <MouseFollowTooltip content={`教学模式 · ${activeMode.label}`}>
                <button
                  type="button"
                  onClick={() => setModeOpen(o => !o)}
                  aria-label={`切换教学模式 · ${activeMode.label}`}
                  aria-expanded={modeOpen}
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors sm:h-7 sm:w-7 ${
                    modeOpen
                      ? 'bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100'
                      : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100'
                  }`}
                >
                  <activeMode.icon className="h-4 w-4" strokeWidth={2} />
                </button>
              </MouseFollowTooltip>
            </div>

            {/* 模型文本 — flat, no frame, just text. */}
            <div ref={modelRef} className="relative">
              <MouseFollowTooltip content={`切换模型 · ${activeModel.label} · 上下文 ${(contextUsed / 1000).toFixed(1)}k / ${(activeModel.contextWindow / 1000).toFixed(0)}k`}>
                <button
                  type="button"
                  onClick={() => setModelOpen(o => !o)}
                  aria-label={`切换模型 · ${activeModel.label}`}
                  aria-expanded={modelOpen}
                  className={`flex h-7 shrink-0 items-center rounded-md px-1.5 text-[12px] font-medium transition-colors ${
                    modelOpen
                      ? 'bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100'
                      : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100'
                  }`}
                >
                  {activeModel.label}
                </button>
              </MouseFollowTooltip>
            </div>
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Right cluster — raised action island: think + send.
              Oval (rounded-xl) shape, lifted 2px above the flat toolbar
              baseline. Border + shadow respond to focus / streaming state. */}
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="relative shrink-0">
              <motion.div
                initial={{ opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1, transition: { type: 'spring', stiffness: 380, damping: 28 } }}
                className={`relative flex items-center gap-1 rounded-xl border bg-white px-1.5 py-1 transition-all -translate-y-[2px] dark:bg-neutral-900 ${
                  isStreaming
                    ? 'border-neutral-400 shadow-lg dark:border-neutral-500'
                    : isFocused
                      ? 'border-neutral-300 shadow-lg dark:border-neutral-600'
                      : 'border-neutral-200 shadow-md dark:border-neutral-700'
                }`}
              >
                {/* 思考 selector — icon-only inside the island */}
                <div ref={thinkRef} className="relative">
                  <MouseFollowTooltip content={`推理强度 · ${activeThink.label}`}>
                    <button
                      type="button"
                      onClick={() => setThinkOpen(o => !o)}
                      aria-label={`切换思考模式 · ${activeThink.label}`}
                      aria-expanded={thinkOpen}
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors ${
                        thinkOpen
                          ? 'bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100'
                          : thinkingMode === 'off'
                            ? 'text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-100'
                            : 'text-neutral-800 hover:bg-neutral-100 dark:text-neutral-100 dark:hover:bg-neutral-800'
                      }`}
                    >
                      <activeThink.icon className="h-4 w-4" strokeWidth={2} />
                    </button>
                  </MouseFollowTooltip>
                </div>

                {/* Send / Stop — the single solid-filled focal point */}
                <AnimatePresence mode="wait">
                  {isStreaming ? (
                    <motion.button
                      key="stop"
                      type="button"
                      initial={{ scale: 0.82, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1, transition: { type: 'spring', stiffness: 500, damping: 26, mass: 0.6 } }}
                      exit={{ scale: 0.82, opacity: 0, transition: { duration: 0.14, ease: [0.16, 1, 0.3, 1] } }}
                      whileTap={{ scale: 0.9 }}
                      onClick={onStop}
                      aria-label="停止生成"
                      className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-neutral-800 text-white transition-colors hover:bg-neutral-700 dark:bg-neutral-200 dark:text-neutral-900 dark:hover:bg-neutral-300"
                    >
                      <motion.span
                        className="pointer-events-none absolute inset-0 rounded-lg border border-neutral-400/50"
                        animate={{ scale: [1, 1.2], opacity: [0.6, 0] }}
                        transition={{ repeat: Infinity, duration: 1.4, ease: 'easeOut' }}
                      />
                      <Square className="h-3.5 w-3.5 fill-current" />
                    </motion.button>
                  ) : (
                    <motion.button
                      key="send"
                      type="button"
                      initial={{ scale: 0.82, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1, transition: { type: 'spring', stiffness: 500, damping: 26, mass: 0.6 } }}
                      exit={{ scale: 0.82, opacity: 0, transition: { duration: 0.14, ease: [0.16, 1, 0.3, 1] } }}
                      whileHover={canSend ? { scale: 1.08, transition: { type: 'spring', stiffness: 400, damping: 18 } } : undefined}
                      whileTap={canSend ? { scale: 0.9, transition: { type: 'spring', stiffness: 600, damping: 25 } } : undefined}
                      onClick={canSend ? () => onSend() : undefined}
                      disabled={!canSend}
                      aria-label="发送消息"
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors duration-200 ${
                        canSend
                          ? 'bg-neutral-800 text-white hover:bg-neutral-700 dark:bg-neutral-200 dark:text-neutral-900 dark:hover:bg-neutral-300'
                          : 'bg-neutral-100 text-neutral-300 dark:bg-neutral-800 dark:text-neutral-600'
                      }`}
                    >
                      <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
                    </motion.button>
                  )}
                </AnimatePresence>
              </motion.div>
            </div>
          </div>
        </div>

        {/* ── Hint row — left-bottom corner ──
            Priority: morphToClear > sceneChip > hintVisibility. */}
        <div className="flex min-h-[14px] items-start">
          <AnimatePresence mode="wait">
            {morphToClear && value.length > 0 && !isStreaming ? (
              <motion.button
                key="clear-all-hint"
                type="button"
                initial={{ opacity: 0, scale: 0.88, y: 4 }}
                animate={{ opacity: 1, scale: 1, y: 0, transition: { type: 'spring', stiffness: 420, damping: 24 } }}
                exit={{ opacity: 0, scale: 0.88, y: 4, transition: { duration: 0.16, ease: [0.4, 0, 1, 1] } }}
                whileTap={{ scale: 0.94 }}
                whileHover={{ scale: 1.03 }}
                onClick={handleClearAll}
                className="flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-2.5 py-1 text-[10.5px] font-semibold text-neutral-900 shadow-sm transition-colors hover:border-neutral-800 hover:bg-neutral-800 hover:text-white dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:border-neutral-200 dark:hover:bg-neutral-200 dark:hover:text-neutral-900"
                aria-label="清空全部内容"
              >
                <Eraser className="h-3.5 w-3.5" strokeWidth={2.2} />
                清空全部内容
              </motion.button>
            ) : sceneChip !== null ? (
              // Scene-aware contextual chip.
              <motion.button
                key={`scene-chip-${sceneChip}`}
                type="button"
                initial={{ opacity: 0, scale: 0.88, y: 4 }}
                animate={{ opacity: 1, scale: 1, y: 0, transition: { type: 'spring', stiffness: 420, damping: 24 } }}
                exit={{ opacity: 0, scale: 0.88, y: 4, transition: { duration: 0.16, ease: [0.4, 0, 1, 1] } }}
                whileTap={{ scale: 0.94 }}
                whileHover={{ scale: 1.03 }}
                onClick={() => handleSceneChipClick(sceneChip)}
                className="flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-2.5 py-1 text-[10.5px] font-medium text-neutral-700 shadow-sm transition-colors hover:border-neutral-800 hover:bg-neutral-800 hover:text-white dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:border-neutral-200 dark:hover:bg-neutral-200 dark:hover:text-neutral-900"
                aria-label={
                  sceneChip === 'pause' ? '暂停生成'
                    : sceneChip === 'expand' ? '展开编辑器'
                      : sceneChip === 'deep-think' ? '切换到深度思考'
                        : '代码模式'
                }
              >
                {sceneChip === 'pause' && <Square className="h-3 w-3 fill-current" />}
                {sceneChip === 'expand' && <Maximize2 className="h-3 w-3" strokeWidth={2.2} />}
                {sceneChip === 'deep-think' && <BrainCircuit className="h-3 w-3" strokeWidth={2.2} />}
                {sceneChip === 'code' && <Code2 className="h-3 w-3" strokeWidth={2.2} />}
                <span>
                  {sceneChip === 'pause' ? '暂停生成'
                    : sceneChip === 'expand' ? '展开编辑器'
                      : sceneChip === 'deep-think' ? '深度思考'
                        : '代码模式'}
                </span>
              </motion.button>
            ) : hintVisibility === 'hide' ? (
              // Hidden placeholder for AnimatePresence collapse.
              <motion.div
                key="hint-hidden"
                initial={{ height: 'auto', opacity: 0.5 }}
                animate={{ height: 0, opacity: 0, transition: { height: { duration: 0.2, ease: [0.4, 0, 1, 1] }, opacity: { duration: 0.12 } } }}
                exit={{ height: 'auto', opacity: 0.5, transition: { duration: 0.1 } }}
                className="overflow-hidden"
                aria-hidden
              />
            ) : (
              <motion.div
                key={`hint-${hintVisibility}`}
                initial={{ height: 0, opacity: 0 }}
                animate={{
                  height: 'auto',
                  opacity: hintVisibility === 'dim' ? 0.45 : 1,
                  transition: { height: { duration: 0.22, ease: [0.16, 1, 0.3, 1] }, opacity: { duration: 0.2 } },
                }}
                exit={{ height: 0, opacity: 0, transition: { height: { duration: 0.18, ease: [0.4, 0, 1, 1] }, opacity: { duration: 0.1 } } }}
                className="overflow-hidden"
              >
                <div className="flex min-w-0 items-center gap-0.5 px-0.5 text-[9.5px] text-neutral-400 transition-opacity dark:text-neutral-500">
                  <KbdKey variant="enter" />
                  <span>发送</span>
                  <span className="text-neutral-300 dark:text-neutral-600">·</span>
                  <KbdKey variant="shift" />
                  <KbdKey variant="enter" />
                  <span>换行</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── Popovers — rendered at the wrapper level (NOT inside the card) so
          they pop OUTWARD above the composer instead of being clipped by the
          card's overflow-hidden or overlapping the textarea. Each is anchored
          to the wrapper's top edge (bottom-full) and stacked above the back
          card via z-50. ── */}
      <AttachMenu menuRef={attachMenuRef} open={attachOpen} direction={attachDir} onSelect={handleAttach} />
      <ModeMenu
        ref={modeMenuRef}
        open={modeOpen}
        current={teachingMode}
        onSelect={m => {
          setTeachingMode(m);
          setModeOpen(false);
        }}
      />
      <ThinkingMenu
        ref={thinkMenuRef}
        open={thinkOpen}
        direction={thinkDir}
        current={thinkingMode}
        onSelect={m => {
          setThinkingMode(m);
          setThinkOpen(false);
        }}
      />
      <ModelCardMenu
        ref={modelMenuRef}
        open={modelOpen}
        direction={modelDir}
        current={selectedModel}
        onSelect={m => {
          setSelectedModel(m);
          setModelOpen(false);
        }}
        contextUsed={contextUsed}
        contextBudget={activeModel.contextWindow}
        modelUsed={modelUsageTokens}
        modelBudget={MODEL_BUDGET}
      />
    </div>
  );
}

// ─── Attachment popover menu ─────────────────────────────────────────────────

// Helper: compute the absolute-positioning class for a popover menu based on
// its flip direction. 'up' (default) anchors the menu ABOVE the trigger
// (bottom-full + mb-2); 'down' anchors it BELOW (top-full + mt-2). The
// animation y-offset is also flipped so the menu slides in from the correct
// side. Menus also get a max-height + scroll so very long lists never
// overflow the viewport.
function menuPos(direction: 'up' | 'down', align: 'left' | 'right' = 'left') {
  const side = align === 'right' ? 'right-0' : 'left-0';
  if (direction === 'down') {
    return {
      className: `absolute top-full ${side} z-50 mt-2 max-h-[60vh] overflow-y-auto`,
      yAnim: 6,
    };
  }
  return {
    className: `absolute bottom-full ${side} z-50 mb-2 max-h-[60vh] overflow-y-auto`,
    yAnim: -6,
  };
}

function AttachMenu({
  open,
  onSelect,
  menuRef,
  direction = 'up',
}: {
  open: boolean;
  onSelect: (opt: AttachmentOption) => void;
  menuRef: React.RefObject<HTMLDivElement | null>;
  direction?: 'up' | 'down';
}) {
  const pos = menuPos(direction, 'left');
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={menuRef}
          initial={{ opacity: 0, y: pos.yAnim, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 380, damping: 30 } }}
          exit={{ opacity: 0, y: pos.yAnim, scale: 0.97, transition: { type: 'spring', stiffness: 380, damping: 30 } }}
          className={`${pos.className} w-64 overflow-hidden rounded-xl border border-neutral-200 bg-white p-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-900`}
        >
          <p className="px-2.5 py-1.5 text-[10.5px] font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
            添加上下文
          </p>
          {ATTACH_OPTIONS.map(opt => {
            const Icon = opt.icon;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => onSelect(opt)}
                className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium text-neutral-800 dark:text-neutral-100">{opt.label}</span>
                  <span className="block text-[11.5px] leading-snug text-neutral-400 dark:text-neutral-500">{opt.desc}</span>
                </span>
              </button>
            );
          })}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Status back card ────────────────────────────────────────────────────────
//
// A layered "shelf" that pops up above the composer card. Two states:
//   • Thinking — the model is in its pre-token phase: a reasoning animation
//     chosen by `thinkingMode` (wave / orbit / cascade) + a label.
//   • Context  — the draft carries @[标签] tokens (imported files / knowledge /
//     links): rendered as removable chips so the user sees exactly what context
//     will be sent.
//
// The shelf is in normal flow (first child of the composer wrapper) so its
// expand/collapse animates the wrapper height naturally, and popovers anchored
// to the wrapper's top edge always clear it. A -2px bottom margin tucks the
// shelf's bottom edge under the composer card's top border + rounded-t-xl +
// flush bottom corners, so the pair reads as two overlapping cards (the back
// card peeking up behind the main input) rather than two stacked bars.

function StatusBackCard({
  isThinking,
  thinkingMode,
  contextTokens,
  onRemoveToken,
}: {
  isThinking: boolean;
  thinkingMode: ThinkingMode;
  contextTokens: string[];
  onRemoveToken: (label: string) => void;
}) {
  const active = isThinking || contextTokens.length > 0;
  return (
    <AnimatePresence initial={false}>
      {active && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 30, mass: 0.7 }}
          className="overflow-hidden"
        >
          <div className="relative mx-1 mb-[-2px] flex h-9 items-center gap-2 rounded-t-xl border border-b-0 border-neutral-200 bg-neutral-50/80 px-3 dark:border-neutral-700 dark:bg-neutral-800/60">
            {isThinking ? (
              <ThinkingAnimation mode={thinkingMode} />
            ) : (
              <>
                <span className="shrink-0 text-[10px] font-medium uppercase tracking-[0.1em] text-neutral-400 dark:text-neutral-500">
                  上下文
                </span>
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 overflow-hidden">
                  {contextTokens.map(label => {
                    const opt = ATTACH_OPTIONS.find(o => o.label === label);
                    const Icon = opt?.icon || FileText;
                    return (
                      <span
                        key={label}
                        className="inline-flex items-center gap-1 rounded-md border border-neutral-200 bg-white px-1.5 py-0.5 text-[11px] text-neutral-600 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-300"
                      >
                        <Icon className="h-3 w-3" />
                        {label}
                        <button
                          type="button"
                          onClick={() => onRemoveToken(label)}
                          className="ml-0.5 flex h-3.5 w-3.5 items-center justify-center rounded text-neutral-400 transition-colors hover:bg-neutral-200 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-600 dark:hover:text-neutral-200"
                          aria-label={`移除 ${label}`}
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </span>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Thinking animation — chosen by thinkingMode ─────────────────────────────
//
// Each reasoning level gets its own visual so the user can tell at a glance
// HOW the model is reasoning, not just that it is. All animations use the
// neutral grey palette (no amber/blue) — selection state is conveyed by motion
// intensity, not color.
//
//   off         — (never shown; isThinking is false when thinking is off
//                 because the model returns fast. Kept here for completeness.)
//   standard    — three-dot wave: a calm, rhythmic "thinking" pulse.
//   deep        — orbiting electrons around a solid core: multi-angle
//                 exploration visualized as satellites circling a central node.
//   structured  — cascading node layers: a 3-tier chain that lights up
//                 sequentially (chain → critique → converge), mirroring the
//                 structured reasoning framework.

function ThinkingAnimation({ mode }: { mode: ThinkingMode }) {
  if (mode === 'deep') {
    return <DeepThinkingAnim />;
  }
  if (mode === 'structured') {
    return <StructuredThinkingAnim />;
  }
  // off + standard both use the calm wave (off won't reach here in practice).
  return <StandardThinkingAnim />;
}

function StandardThinkingAnim() {
  return (
    <div className="flex items-center gap-2">
      <span className="flex items-center gap-1">
        {[0, 1, 2].map(d => (
          <motion.span
            key={d}
            className="h-1.5 w-1.5 rounded-full bg-neutral-500 dark:bg-neutral-300"
            animate={{ y: [0, -3, 0], opacity: [0.4, 1, 0.4] }}
            transition={{ repeat: Infinity, duration: 1, delay: d * 0.15, ease: 'easeInOut' }}
          />
        ))}
      </span>
      <span className="text-[11.5px] font-medium text-neutral-600 dark:text-neutral-300">
        模型正在思考
      </span>
    </div>
  );
}

function DeepThinkingAnim() {
  // A solid core with 3 orbiting satellites — multi-angle exploration.
  // Pure monochrome: the core is solid neutral-900 (light) / neutral-100 (dark),
  // the orbit rings + electron are muted neutrals.
  return (
    <div className="flex items-center gap-2">
      <span className="relative flex h-4 w-4 items-center justify-center">
        {/* core */}
        <motion.span
          className="absolute h-1.5 w-1.5 rounded-full bg-neutral-800 dark:bg-neutral-200"
          animate={{ scale: [1, 1.25, 1], opacity: [0.7, 1, 0.7] }}
          transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }}
        />
        {/* orbit ring 1 (tilted) */}
        <motion.span
          className="absolute h-4 w-4 rounded-full border border-neutral-400/60 dark:border-neutral-500/60"
          style={{ transform: 'rotateX(65deg)' }}
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 2.4, ease: 'linear' }}
        />
        {/* orbit ring 2 (different tilt) */}
        <motion.span
          className="absolute h-4 w-4 rounded-full border border-neutral-400/40 dark:border-neutral-500/40"
          style={{ transform: 'rotateY(65deg)' }}
          animate={{ rotate: -360 }}
          transition={{ repeat: Infinity, duration: 3, ease: 'linear' }}
        />
        {/* electron (orbiting dot) */}
        <motion.span
          className="absolute h-1 w-1 rounded-full bg-neutral-700 dark:bg-neutral-300"
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1.8, ease: 'linear' }}
          style={{ transformOrigin: '0px 8px' }}
        />
      </span>
      <span className="text-[11.5px] font-medium text-neutral-600 dark:text-neutral-300">
        深度推理中
        <span className="ml-1 text-neutral-400 dark:text-neutral-500">· 多角度 · 反例检验</span>
      </span>
    </div>
  );
}

function StructuredThinkingAnim() {
  // 3 node tiers lighting up sequentially: chain → critique → converge.
  // Each tier pulses opacity + scale + border contrast (no color shift).
  const tiers = ['链式', '批判', '收敛'];
  return (
    <div className="flex items-center gap-2">
      <span className="flex items-center gap-1">
        {tiers.map((t, i) => (
          <motion.span
            key={t}
            className="flex h-4 items-center gap-0.5 rounded-full border border-neutral-300/70 bg-white px-1 text-[8.5px] font-medium text-neutral-600 dark:border-neutral-600/70 dark:bg-neutral-800 dark:text-neutral-300"
            animate={{
              opacity: [0.4, 1, 0.4],
              scale: [0.92, 1.04, 0.92],
              borderColor: [
                'rgba(168,162,158,0.5)',
                'rgba(23,23,23,0.7)',
                'rgba(168,162,158,0.5)',
              ],
            }}
            transition={{
              repeat: Infinity,
              duration: 2.1,
              delay: i * 0.4,
              ease: 'easeInOut',
            }}
          >
            <span
              className="h-1 w-1 rounded-full bg-neutral-500 dark:bg-neutral-400"
              style={{ animation: 'none' }}
            />
            {t}
          </motion.span>
        ))}
        {/* connecting lines */}
        <span className="sr-only">→</span>
      </span>
      <span className="text-[11.5px] font-medium text-neutral-600 dark:text-neutral-300">
        结构化推理中
      </span>
    </div>
  );
}

// ─── Teaching-mode popover menu ──────────────────────────────────────────────

const ModeMenu = React.forwardRef<
  HTMLDivElement,
  {
    open: boolean;
    current: TeachingMode;
    onSelect: (m: TeachingMode) => void;
  }
>(({ open, current, onSelect }, menuRef) => {
  // Mode menu opens BESIDE the trigger (to the right), not above. This gives
  // a grounded, 3D-layered feel — the menu reads as an extension of the
  // button rather than a floating panel, and avoids the menu drifting too
  // high when the composer is tall (long text / expanded mode). The trigger
  // is on the LEFT side of the toolbar, so there's room to the right.
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={menuRef}
          initial={{ opacity: 0, scale: 0.94, x: -8 }}
          animate={{ opacity: 1, scale: 1, x: 0, transition: { type: 'spring', stiffness: 420, damping: 28 } }}
          exit={{ opacity: 0, scale: 0.94, x: -8, transition: { type: 'spring', stiffness: 420, damping: 28 } }}
          className="absolute left-full top-0 z-50 ml-2 max-h-[60vh] w-72 overflow-y-auto overflow-hidden rounded-xl border border-neutral-200 bg-white p-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
        >
          <p className="px-2.5 py-1.5 text-[10.5px] font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
            教学模式
          </p>
          {MODE_OPTIONS.map(opt => {
            const Icon = opt.icon;
            const active = opt.key === current;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => onSelect(opt.key)}
                className={`flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${
                  active ? 'bg-neutral-100 dark:bg-neutral-800' : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'
                }`}
              >
                <span
                  className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
                    active
                      ? 'bg-neutral-800 text-white dark:bg-neutral-200 dark:text-neutral-900'
                      : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="text-[13px] font-medium text-neutral-800 dark:text-neutral-100">{opt.label}</span>
                    {active && <Check className="h-3.5 w-3.5 text-neutral-500 dark:text-neutral-400" />}
                  </span>
                  <span className="block text-[11.5px] leading-snug text-neutral-400 dark:text-neutral-500">{opt.desc}</span>
                </span>
              </button>
            );
          })}
        </motion.div>
      )}
    </AnimatePresence>
  );
});
ModeMenu.displayName = 'ModeMenu';

// ─── Thinking-mode popover menu ──────────────────────────────────────────────
//
// 4 reasoning levels. Each row shows an icon, label, and a short description
// of what the model does internally at that level. The active level gets a
// filled grey icon chip + a check mark — neutral palette, no amber accent.

const ThinkingMenu = React.forwardRef<
  HTMLDivElement,
  {
    open: boolean;
    direction?: 'up' | 'down';
    current: ThinkingMode;
    onSelect: (m: ThinkingMode) => void;
  }
>(({ open, direction = 'up', current, onSelect }, menuRef) => {
  const pos = menuPos(direction, 'right');
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={menuRef}
          initial={{ opacity: 0, y: pos.yAnim, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 380, damping: 30 } }}
          exit={{ opacity: 0, y: pos.yAnim, scale: 0.97, transition: { type: 'spring', stiffness: 380, damping: 30 } }}
          className={`${pos.className} w-72 overflow-hidden rounded-xl border border-neutral-200 bg-white p-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-900`}
        >
          <p className="flex items-center gap-1 px-2.5 py-1.5 text-[10.5px] font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
            <BrainCircuit className="h-3 w-3" />
            思考模式
          </p>
          {THINK_OPTIONS.map(opt => {
            const Icon = opt.icon;
            const active = opt.key === current;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => onSelect(opt.key)}
                className={`flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${
                  active ? 'bg-neutral-100 dark:bg-neutral-800' : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'
                }`}
              >
                <span
                  className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
                    active
                      ? 'bg-neutral-800 text-white dark:bg-neutral-200 dark:text-neutral-900'
                      : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="text-[13px] font-medium text-neutral-800 dark:text-neutral-100">{opt.label}</span>
                    {active && <Check className="h-3.5 w-3.5 text-neutral-700 dark:text-neutral-300" />}
                  </span>
                  <span className="block text-[11.5px] leading-snug text-neutral-400 dark:text-neutral-500">{opt.desc}</span>
                </span>
              </button>
            );
          })}
          <p className="px-2.5 py-1.5 text-[10px] leading-snug text-neutral-400 dark:text-neutral-500">
            普通模型均具备深度推理能力。开启后模型在内部推理完成后再作答，回答更严谨；推理动画会在卡片上方展示当前推理形态。
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
});
ThinkingMenu.displayName = 'ThinkingMenu';

// ─── ModelCard popover menu ──────────────────────────────────────────────────
//
// The merged "选项卡片" the user requested: a single popover that exposes
//   1. Model selection (GLM-4.6 / GLM-4.5 / GLM-4-Air) — radio list
//   2. 上下文用量 — meter showing current draft + history vs context window
//   3. 模型用量 — meter showing cumulative session tokens vs budget
//
// All in pure neutral monochrome. Active model gets a filled solid dot.

const ModelCardMenu = React.forwardRef<
  HTMLDivElement,
  {
    open: boolean;
    direction?: 'up' | 'down';
    current: SelectedModel;
    onSelect: (m: SelectedModel) => void;
    contextUsed: number;
    contextBudget: number;
    modelUsed: number;
    modelBudget: number;
  }
>(({ open, direction = 'up', current, onSelect, contextUsed, contextBudget, modelUsed, modelBudget }, menuRef) => {
  const pos = menuPos(direction, 'right');
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={menuRef}
          initial={{ opacity: 0, y: pos.yAnim, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 380, damping: 30 } }}
          exit={{ opacity: 0, y: pos.yAnim, scale: 0.97, transition: { type: 'spring', stiffness: 380, damping: 30 } }}
          className={`${pos.className} w-80 overflow-hidden rounded-xl border border-neutral-200 bg-white p-2 shadow-lg dark:border-neutral-700 dark:bg-neutral-900`}
        >
          {/* ── Section 1: Model selection ── */}
          <p className="flex items-center gap-1.5 px-1 py-1 text-[10.5px] font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
            <Cpu className="h-3 w-3" />
            模型
          </p>
          <div className="flex flex-col gap-0.5">
            {MODEL_OPTIONS.map(opt => {
              const active = opt.key === current;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => onSelect(opt.key)}
                  className={`flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left transition-colors ${
                    active ? 'bg-neutral-100 dark:bg-neutral-800' : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'
                  }`}
                >
                  <span
                    className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                      active
                        ? 'border-neutral-800 bg-neutral-800 dark:border-neutral-200 dark:bg-neutral-200'
                        : 'border-neutral-300 dark:border-neutral-600'
                    }`}
                  >
                    {active && <CircleDot className="h-2 w-2 text-white dark:text-neutral-900" strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="text-[13px] font-medium text-neutral-800 dark:text-neutral-100">{opt.label}</span>
                      <span className="rounded-full border border-neutral-200 px-1.5 py-px text-[9.5px] text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
                        {(opt.contextWindow / 1000).toFixed(0)}k 上下文
                      </span>
                    </span>
                    <span className="block text-[11.5px] leading-snug text-neutral-400 dark:text-neutral-500">{opt.desc}</span>
                  </span>
                </button>
              );
            })}
          </div>

          {/* ── Section 2: Usage meters ── */}
          <div className="my-2 h-px bg-neutral-200 dark:bg-neutral-700" />

          <p className="flex items-center gap-1.5 px-1 py-1 text-[10.5px] font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
            <Gauge className="h-3 w-3" />
            用量
          </p>

          {/* Context usage meter */}
          <UsageMeter
            label="上下文用量"
            icon={Layers}
            used={contextUsed}
            budget={contextBudget}
            unit="tokens"
          />
          {/* Model usage meter (this session) */}
          <UsageMeter
            label="模型用量"
            icon={Cpu}
            used={modelUsed}
            budget={modelBudget}
            unit="tokens / 会话"
          />

          <p className="mt-1.5 px-1 text-[10px] leading-snug text-neutral-400 dark:text-neutral-500">
            用量为估算值，仅作可视化参考。模型切换将影响下一次发送的请求。
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
});
ModelCardMenu.displayName = 'ModelCardMenu';

// ─── Usage meter — a thin horizontal bar with numeric label ──────────────────
//
// Pure monochrome: track is neutral-200/700, fill is neutral-900/100.
// When usage exceeds 85%, the fill gains a subtle striped pattern (still B/W)
// to hint at pressure without introducing a warning color.

function UsageMeter({
  label,
  icon: Icon,
  used,
  budget,
  unit,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  used: number;
  budget: number;
  unit: string;
}) {
  const fraction = Math.min(1, used / budget);
  const pressure = fraction > 0.85;
  const fmt = (n: number) => {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return `${n}`;
  };
  // Semantic label — plain-language reading of the token count
  // ("还很轻松" / "余量充足" / "接近上限" / "建议新建会话"). Raw numbers like
  // "8k/200k" are hard to act on; a qualitative label maps the number to an action.
  let semantic: string;
  if (fraction < 0.25) semantic = '还很轻松';
  else if (fraction < 0.6) semantic = '余量充足';
  else if (fraction < 0.85) semantic = '接近上限';
  else semantic = '建议新建会话';
  return (
    <div className="px-1 py-1.5">
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="flex items-center gap-1 text-neutral-600 dark:text-neutral-300">
          <Icon className="h-3 w-3" />
          {label}
          <span className="ml-1 rounded-full border border-neutral-200 px-1.5 py-px text-[9px] text-neutral-400 dark:border-neutral-700 dark:text-neutral-500">
            {semantic}
          </span>
        </span>
        <span className="tabular-nums text-neutral-400 dark:text-neutral-500">
          {fmt(used)} / {fmt(budget)} <span className="text-neutral-400 dark:text-neutral-600">{unit}</span>
        </span>
      </div>
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
        <motion.div
          className={`h-full rounded-full ${pressure ? 'bg-neutral-800 dark:bg-neutral-200' : 'bg-neutral-600 dark:bg-neutral-400'}`}
          initial={false}
          animate={{ width: `${Math.max(2, fraction * 100)}%` }}
          transition={{ type: 'spring', stiffness: 200, damping: 26 }}
        />
        {pressure && (
          <motion.div
            className="absolute inset-0 opacity-30"
            style={{
              backgroundImage:
                'repeating-linear-gradient(45deg, rgba(0,0,0,0.4) 0, rgba(0,0,0,0.4) 1px, transparent 1px, transparent 4px)',
            }}
            animate={{ x: [0, 8] }}
            transition={{ repeat: Infinity, duration: 0.6, ease: 'linear' }}
          />
        )}
      </div>
    </div>
  );
}

// ─── KbdKey — hand-drawn miniature keyboard-key SVG ──────────────────────────
//
// The user asked for the keyboard hint to look like an actual keyboard key
// (so the hint maps to a physical key location, not an abstract arrow
// direction). We draw a tiny isometric key cap:
//
//   ┌──────┐
//   │ ⏎    │   ← Enter variant: a bent arrow inside the cap
//   └──────┘
//
//   ┌──────┐
//   │ ⇧    │   ← Shift variant: an upward hollow triangle
//   └──────┘
//
// The cap has a 1px top highlight + 1px bottom shadow to read as a pressed
// key. Stroke is neutral-500; the glyph is neutral-700 so it's legible at
// 11px. Pure SVG, no emoji, no external icon dependency.

function KbdKey({ variant }: { variant: 'enter' | 'shift' }) {
  // 16x14 viewBox: a key cap with a subtle 3D edge.
  return (
    <svg
      width="14"
      height="11"
      viewBox="0 0 16 14"
      fill="none"
      className="shrink-0 text-neutral-500 dark:text-neutral-400"
      aria-hidden
    >
      {/* key cap body */}
      <rect
        x="1"
        y="2.5"
        width="14"
        height="9.5"
        rx="1.5"
        className="fill-neutral-100 stroke-current stroke-[1] dark:fill-neutral-800"
      />
      {/* top highlight (1px) */}
      <path
        d="M 2.5 3 L 13.5 3"
        className="stroke-white/70 stroke-[0.75] dark:stroke-white/20"
        strokeLinecap="round"
      />
      {/* bottom shadow (1px) */}
      <path
        d="M 2.5 11.5 L 13.5 11.5"
        className="stroke-black/20 stroke-[0.75] dark:stroke-black/40"
        strokeLinecap="round"
      />
      {variant === 'enter' ? (
        // Enter glyph: a bent arrow (down-then-left) — the universal "Enter"
        // key symbol on physical keyboards.
        <path
          d="M 10 4.5 L 10 8 L 5 8 M 10 4.5 L 8 6.5 M 10 4.5 L 12 6.5"
          className="stroke-current stroke-[1.2]"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      ) : (
        // Shift glyph: a hollow upward arrow — the universal "Shift" symbol.
        <path
          d="M 8 4 L 5 7 L 6.7 7 L 6.7 8.5 L 9.3 8.5 L 9.3 7 L 11 7 Z"
          className="fill-current stroke-current stroke-[0.8]"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}
