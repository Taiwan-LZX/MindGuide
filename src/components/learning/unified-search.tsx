'use client';

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  X,
  MessageSquare,
  BookOpen,
  FileText,
  Lightbulb,
  Keyboard,
  Hash,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type ResultCategory = 'document' | 'knowledge' | 'chat' | 'lesson';

interface SearchResult {
  id: string;
  category: ResultCategory;
  title: string;
  snippet: string;
  relevance: number; // 0-1
  rawScore?: number;
  timestamp?: string;
  sessionId?: string;
  sessionTitle?: string;
  // document-specific
  materialId?: string;
  materialTitle?: string;
  filename?: string;
  section?: string;
  sectionPath?: string;
  page?: number;
  blockType?: string;
  // knowledge-specific
  knowledgeId?: string;
  knowledgeCategory?: string;
  // chat-specific
  messageId?: string;
  messageRole?: string;
}

// ─── Category Config ─────────────────────────────────────────────────────────

const categoryConfig: Record<
  ResultCategory,
  { label: string; icon: React.ElementType; accent: string; tint: string }
> = {
  document: {
    label: '文档',
    icon: FileText,
    accent: 'text-emerald-600 dark:text-emerald-400',
    tint: 'bg-emerald-50 dark:bg-emerald-950/40',
  },
  knowledge: {
    label: '知识',
    icon: Lightbulb,
    accent: 'text-amber-600 dark:text-amber-400',
    tint: 'bg-amber-50 dark:bg-amber-950/40',
  },
  chat: {
    label: '对话',
    icon: MessageSquare,
    accent: 'text-sky-600 dark:text-sky-400',
    tint: 'bg-sky-50 dark:bg-sky-950/40',
  },
  lesson: {
    label: '主题',
    icon: BookOpen,
    accent: 'text-violet-600 dark:text-violet-400',
    tint: 'bg-violet-50 dark:bg-violet-950/40',
  },
};

const allCategories: ResultCategory[] = ['document', 'knowledge', 'chat', 'lesson'];

// ─── Animation ───────────────────────────────────────────────────────────────

const panelVariants = {
  hidden: { opacity: 0, y: -6, scale: 0.98 },
  visible: {
    opacity: 1, y: 0, scale: 1,
    transition: { type: 'spring' as const, stiffness: 320, damping: 26, mass: 0.8 },
  },
  exit: {
    opacity: 0, y: -4, scale: 0.98,
    transition: {
      opacity: { duration: 0.16, ease: [0.16, 1, 0.3, 1] as const },
      y: { duration: 0.18, ease: [0.4, 0, 1, 1] as const },
      scale: { duration: 0.16, ease: [0.4, 0, 1, 1] as const },
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 4 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: {
      delay: Math.min(0.04 + 0.025 * i, 0.18),
      type: 'spring' as const,
      stiffness: 380,
      damping: 28,
      mass: 0.6,
    },
  }),
};

// ─── Relative time formatter ─────────────────────────────────────────────────
function relTime(iso?: string): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins}分钟前`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}小时前`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return '昨天';
  if (days < 7) return `${days}天前`;
  return new Date(iso).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

// ─── Block-type → display label ──────────────────────────────────────────────
const blockTypeLabel: Record<string, string> = {
  text: '正文',
  title: '标题',
  table: '表格',
  figure: '图示',
  formula: '公式',
  list: '列表',
  code: '代码',
  caption: '说明',
  reference: '参考',
  header: '页眉',
  footer: '页脚',
};

// ─── Component ────────────────────────────────────────────────────────────────

interface UnifiedSearchProps {
  value: string;
  onChange: (v: string) => void;
  onResultClick?: (result: SearchResult) => void;
  /** Optional: restrict search to the currently open session. */
  sessionId?: string;
}

export function UnifiedSearch({ value, onChange, onResultClick, sessionId }: UnifiedSearchProps) {
  const [activeCategory, setActiveCategory] = useState<ResultCategory | 'all'>('all');
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [allResults, setAllResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [resultScope, setResultScope] = useState<'all' | string>('all');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const reqIdRef = useRef(0);

  // Debounced server search — 220ms after the user stops typing.
  useEffect(() => {
    const q = value.trim();
    if (!q) {
      setAllResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    const myId = ++reqIdRef.current;
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q, limit: '30' });
        if (sessionId) params.set('sessionId', sessionId);
        const res = await fetch(`/api/search?${params.toString()}`);
        if (!res.ok) {
          if (myId === reqIdRef.current) setAllResults([]);
          return;
        }
        const data = await res.json();
        if (myId === reqIdRef.current) {
          setAllResults((data.results || []) as SearchResult[]);
          setResultScope(data.scope || 'all');
        }
      } catch {
        if (myId === reqIdRef.current) setAllResults([]);
      } finally {
        if (myId === reqIdRef.current) setIsSearching(false);
      }
    }, 220);
    return () => clearTimeout(t);
  }, [value, sessionId]);

  // Reset active category when the query changes.
  useEffect(() => {
    setActiveCategory('all');
    setFocusedIndex(-1);
  }, [value]);

  const filteredResults = useMemo(() => {
    if (activeCategory === 'all') return allResults;
    return allResults.filter((r) => r.category === activeCategory);
  }, [allResults, activeCategory]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const cat of allCategories) {
      counts[cat] = allResults.filter((r) => r.category === cat).length;
    }
    return counts;
  }, [allResults]);

  const totalCount = allResults.length;

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value);
      setIsOpen(true);
    },
    [onChange]
  );

  const handleFocus = useCallback(() => {
    if (value.trim()) setIsOpen(true);
  }, [value]);

  const handleClear = useCallback(() => {
    onChange('');
    setIsOpen(false);
    setFocusedIndex(-1);
    inputRef.current?.focus();
  }, [onChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen || filteredResults.length === 0) {
        if (e.key === 'Escape') {
          setIsOpen(false);
          setFocusedIndex(-1);
        }
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedIndex((prev) => Math.min(prev + 1, filteredResults.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedIndex((prev) => Math.max(prev - 1, -1));
      } else if (e.key === 'Enter' && focusedIndex >= 0) {
        e.preventDefault();
        onResultClick?.(filteredResults[focusedIndex]);
        setIsOpen(false);
      } else if (e.key === 'Escape') {
        setIsOpen(false);
        setFocusedIndex(-1);
      }
    },
    [isOpen, filteredResults, focusedIndex, onResultClick]
  );

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const timer = setTimeout(() => document.addEventListener('mousedown', handler), 50);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handler);
    };
  }, [isOpen]);

  // Highlight matching text in a snippet.
  const highlightText = useCallback(
    (text: string, query: string) => {
      if (!query.trim() || !text) return text;
      // Escape regex specials, then split on the query (case-insensitive).
      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(${escaped})`, 'gi');
      const parts = text.split(regex);
      return parts.map((part, i) =>
        regex.test(part) ? (
          <mark
            key={i}
            className="rounded-[2px] bg-amber-200/70 px-0.5 font-medium text-neutral-900 dark:bg-amber-500/30 dark:text-amber-100"
          >
            {part}
          </mark>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        )
      );
    },
    []
  );

  // Relevance → bar color (semantic: green=strong, amber=medium, gray=weak).
  const relevanceColor = (r: number): string => {
    if (r >= 0.75) return 'bg-emerald-500 dark:bg-emerald-400';
    if (r >= 0.5) return 'bg-amber-500 dark:bg-amber-400';
    if (r >= 0.3) return 'bg-sky-500 dark:bg-sky-400';
    return 'bg-neutral-400 dark:bg-neutral-500';
  };

  const placeholderText = sessionId ? '搜索当前会话…' : '搜索文档 · 知识 · 对话…';

  return (
    <div ref={containerRef} className="relative">
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
        <input
          ref={inputRef}
          type="text"
          placeholder={placeholderText}
          value={value}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          className="h-8 w-full rounded-lg bg-neutral-200/60 pl-8 pr-14 text-[13px] text-neutral-700 placeholder:text-neutral-400 transition-all duration-200 focus:bg-white focus:outline-none focus:ring-1 focus:ring-neutral-300 dark:bg-neutral-800/60 dark:text-neutral-200 dark:placeholder:text-neutral-500 dark:focus:bg-neutral-800 dark:focus:ring-neutral-600"
        />
        {value ? (
          <motion.button
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            whileTap={{ scale: 0.85, transition: { type: 'spring', stiffness: 600, damping: 18 } }}
            onClick={handleClear}
            aria-label="清除搜索"
            className="absolute right-2 top-1/2 flex h-4.5 w-4.5 -translate-y-1/2 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-200 hover:text-neutral-600 dark:hover:bg-neutral-700 dark:hover:text-neutral-300"
          >
            <X className="h-3 w-3" />
          </motion.button>
        ) : (
          <kbd
            className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-neutral-300/60 bg-white/70 px-1 py-0.5 font-sans text-[9px] font-medium text-neutral-400 dark:border-neutral-600/60 dark:bg-neutral-800/70 dark:text-neutral-500"
            title="按 ⌘K / Ctrl+K 打开命令面板"
          >
            ⌘K
          </kbd>
        )}
      </div>

      {/* Dropdown Panel */}
      <AnimatePresence>
        {isOpen && value.trim() && (
          <motion.div
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="absolute left-0 top-[calc(100%+4px)] z-[70] w-[calc(100%+24px)] -ml-3 overflow-hidden rounded-xl border border-neutral-200/80 bg-white/95 shadow-xl shadow-neutral-900/8 backdrop-blur-sm dark:border-neutral-700/60 dark:bg-neutral-900/95 dark:shadow-black/20"
          >
            {/* Category Tabs */}
            <div className="flex items-center gap-1 border-b border-neutral-100 px-2 pt-2 pb-1.5 dark:border-neutral-800">
              <button
                onClick={() => {
                  setActiveCategory('all');
                  setFocusedIndex(-1);
                }}
                className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] font-medium transition-colors ${
                  activeCategory === 'all'
                    ? 'bg-white text-neutral-800 shadow-sm dark:bg-neutral-700 dark:text-neutral-100'
                    : 'text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200'
                }`}
              >
                全部
                {totalCount > 0 && (
                  <span className="text-[10px] text-neutral-400 dark:text-neutral-500">{totalCount}</span>
                )}
              </button>
              {allCategories.map((cat) => {
                const config = categoryConfig[cat];
                const count = categoryCounts[cat] || 0;
                if (count === 0 && activeCategory !== cat) return null;
                return (
                  <button
                    key={cat}
                    onClick={() => {
                      setActiveCategory(cat);
                      setFocusedIndex(-1);
                    }}
                    className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] font-medium transition-colors ${
                      activeCategory === cat
                        ? 'bg-white text-neutral-800 shadow-sm dark:bg-neutral-700 dark:text-neutral-100'
                        : 'text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200'
                    }`}
                  >
                    {config.label}
                    {count > 0 && (
                      <span className="text-[10px] text-neutral-400 dark:text-neutral-500">{count}</span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Results */}
            <div className="max-h-[340px] overflow-y-auto custom-scrollbar">
              {isSearching ? (
                <div className="flex flex-col items-center py-8">
                  <div className="h-4 w-4 rounded-full border-[1.5px] border-neutral-200 border-t-neutral-500 animate-spin dark:border-neutral-700 dark:border-t-neutral-300" />
                  <p className="mt-2 text-[12px] text-neutral-400 dark:text-neutral-500">语义检索中…</p>
                </div>
              ) : filteredResults.length > 0 ? (
                <motion.div initial="hidden" animate="visible" className="py-1">
                  {filteredResults.map((result, index) => {
                    const config = categoryConfig[result.category];
                    const Icon = config.icon;
                    const isFocused = index === focusedIndex;
                    return (
                      <motion.button
                        key={result.id}
                        custom={index}
                        variants={itemVariants}
                        onClick={() => {
                          onResultClick?.(result);
                          setIsOpen(false);
                        }}
                        onMouseEnter={() => setFocusedIndex(index)}
                        className={`flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors ${
                          isFocused
                            ? 'bg-neutral-50 dark:bg-neutral-800/60'
                            : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/40'
                        }`}
                      >
                        {/* Category Icon */}
                        <div
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${config.tint}`}
                        >
                          <Icon className={`h-3.5 w-3.5 ${config.accent}`} />
                        </div>

                        {/* Content */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className="truncate text-[12.5px] font-medium text-neutral-700 dark:text-neutral-200">
                              {highlightText(result.title, value)}
                            </p>
                            {result.blockType && blockTypeLabel[result.blockType] && (
                              <span className="shrink-0 rounded bg-neutral-100 px-1 py-0.5 text-[9px] text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                                {blockTypeLabel[result.blockType]}
                              </span>
                            )}
                            {result.messageRole === 'user' && (
                              <span className="shrink-0 rounded bg-sky-100 px-1 py-0.5 text-[9px] text-sky-600 dark:bg-sky-950/50 dark:text-sky-400">
                                提问
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-neutral-500 dark:text-neutral-400">
                            {highlightText(result.snippet, value)}
                          </p>
                          {/* Source attribution row */}
                          <div className="mt-1 flex items-center gap-1.5 text-[10px] text-neutral-400 dark:text-neutral-500">
                            {result.sessionTitle && result.sessionTitle !== result.title && (
                              <>
                                <span className="truncate max-w-[120px]">{result.sessionTitle}</span>
                                <span className="text-neutral-300 dark:text-neutral-600">·</span>
                              </>
                            )}
                            {result.sectionPath && (
                              <>
                                <span className="truncate max-w-[140px]">{result.sectionPath}</span>
                                {typeof result.page === 'number' && (
                                  <span className="text-neutral-300 dark:text-neutral-600">·</span>
                                )}
                              </>
                            )}
                            {typeof result.page === 'number' && (
                              <>
                                <span>p.{result.page}</span>
                                <span className="text-neutral-300 dark:text-neutral-600">·</span>
                              </>
                            )}
                            {result.knowledgeCategory && (
                              <>
                                <span>{result.knowledgeCategory}</span>
                                <span className="text-neutral-300 dark:text-neutral-600">·</span>
                              </>
                            )}
                            <span>{relTime(result.timestamp)}</span>
                          </div>
                        </div>

                        {/* Relevance + Category Tag */}
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <span
                            className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${config.tint} ${config.accent}`}
                          >
                            {config.label}
                          </span>
                          {/* Relevance bar — 3-segment, colored by score tier */}
                          {result.relevance > 0 && (
                            <div className="flex items-end gap-[2px]" title={`相关度 ${Math.round(result.relevance * 100)}%`}>
                              {[0, 1, 2].map((seg) => (
                                <span
                                  key={seg}
                                  className={`w-[3px] rounded-full transition-all ${
                                    result.relevance >= (seg + 1) / 3
                                      ? relevanceColor(result.relevance)
                                      : 'bg-neutral-200 dark:bg-neutral-700'
                                  }`}
                                  style={{ height: `${4 + seg * 3}px` }}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      </motion.button>
                    );
                  })}
                </motion.div>
              ) : (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col items-center py-8"
                >
                  <Search className="mb-2 h-4 w-4 text-neutral-300 dark:text-neutral-600" />
                  <p className="text-[12px] text-neutral-400 dark:text-neutral-500">
                    没有找到相关结果
                  </p>
                  {resultScope !== 'all' && (
                    <p className="mt-1 text-[10px] text-neutral-300 dark:text-neutral-600">
                      当前范围：{resultScope === 'documents' ? '仅文档' : resultScope === 'knowledge' ? '仅知识' : resultScope === 'messages' ? '仅对话' : '仅主题'}
                    </p>
                  )}
                </motion.div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-neutral-100 px-3 py-1.5 dark:border-neutral-800">
              <span className="flex items-center gap-1 text-[10px] text-neutral-300 dark:text-neutral-600">
                <Hash className="h-3 w-3" />
                {filteredResults.length} 个结果
              </span>
              <div className="flex items-center gap-1 text-[10px] text-neutral-300 dark:text-neutral-600">
                <Keyboard className="h-3 w-3" />
                <span>↑↓ 导航 · Enter 选择 · Esc 关闭</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
