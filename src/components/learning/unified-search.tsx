'use client';

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  X,
  MessageSquare,
  BookOpen,
  ArrowUp,
  ArrowDown,
  Keyboard,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type ResultCategory = 'chat' | 'lesson';

interface SearchResult {
  id: string;
  category: ResultCategory;
  title: string;
  subtitle: string;
  timestamp: string;
  sessionId?: string;
}

// ─── Category Config ─────────────────────────────────────────────────────────

const categoryConfig: Record<ResultCategory, { label: string; icon: React.ElementType }> = {
  chat: { label: '对话', icon: MessageSquare },
  lesson: { label: '主题', icon: BookOpen },
};

const allCategories: ResultCategory[] = ['chat', 'lesson'];

// ─── Animation ───────────────────────────────────────────────────────────────

const panelVariants = {
  hidden: { opacity: 0, y: -6, scale: 0.98 },
  visible: {
    opacity: 1, y: 0, scale: 1,
    transition: { type: 'spring', stiffness: 320, damping: 26, mass: 0.8 },
  },
  exit: { opacity: 0, y: -4, scale: 0.98, transition: { duration: 0.2, ease: [0.4, 0, 1, 1] } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 4 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: {
      delay: 0.04 + 0.03 * i,
      type: 'spring',
      stiffness: 380,
      damping: 28,
      mass: 0.6,
    },
  }),
};

// ─── Relative time formatter ─────────────────────────────────────────────────
function relTime(iso: string): string {
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

// ─── Component ────────────────────────────────────────────────────────────────

interface UnifiedSearchProps {
  value: string;
  onChange: (v: string) => void;
  onResultClick?: (result: SearchResult) => void;
}

export function UnifiedSearch({ value, onChange, onResultClick }: UnifiedSearchProps) {
  const [activeCategory, setActiveCategory] = useState<ResultCategory | 'all'>('all');
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [allResults, setAllResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
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
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=20`);
        if (!res.ok) { setAllResults([]); return; }
        const data = await res.json();
        // Only apply if this is still the latest request.
        if (myId === reqIdRef.current) {
          setAllResults((data.results || []) as SearchResult[]);
        }
      } catch {
        if (myId === reqIdRef.current) setAllResults([]);
      } finally {
        if (myId === reqIdRef.current) setIsSearching(false);
      }
    }, 220);
    return () => clearTimeout(t);
  }, [value]);

  // Filter results by category tab
  const filteredResults = useMemo(() => {
    if (activeCategory === 'all') return allResults;
    return allResults.filter(r => r.category === activeCategory);
  }, [allResults, activeCategory]);

  // Count per category
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const cat of allCategories) {
      counts[cat] = allResults.filter(r => r.category === cat).length;
    }
    return counts;
  }, [allResults]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
    setIsOpen(true);
    setFocusedIndex(-1);
    setActiveCategory('all');
  }, [onChange]);

  const handleFocus = useCallback(() => {
    if (value.trim()) setIsOpen(true);
  }, [value]);

  const handleClear = useCallback(() => {
    onChange('');
    setIsOpen(false);
    setFocusedIndex(-1);
    inputRef.current?.focus();
  }, [onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!isOpen || filteredResults.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex(prev => Math.min(prev + 1, filteredResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex(prev => Math.max(prev - 1, -1));
    } else if (e.key === 'Enter' && focusedIndex >= 0) {
      e.preventDefault();
      onResultClick?.(filteredResults[focusedIndex]);
      setIsOpen(false);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setFocusedIndex(-1);
    }
  }, [isOpen, filteredResults, focusedIndex, onResultClick]);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const timer = setTimeout(() => document.addEventListener('mousedown', handler), 50);
    return () => { clearTimeout(timer); document.removeEventListener('mousedown', handler); };
  }, [isOpen]);

  // Highlight matching text
  const highlightText = (text: string, query: string) => {
    if (!query.trim()) return text;
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, i) =>
      regex.test(part)
        ? <span key={i} className="bg-neutral-200/80 font-medium dark:bg-neutral-700/60">{part}</span>
        : part
    );
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
        <input
          ref={inputRef}
          type="text"
          placeholder="搜索主题..."
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
            whileTap={{
              scale: 0.85,
              transition: { type: 'spring', stiffness: 600, damping: 18 },
            }}
            onClick={handleClear}
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
                onClick={() => setActiveCategory('all')}
                className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] font-medium transition-colors ${
                  activeCategory === 'all'
                    ? 'bg-white text-neutral-800 shadow-sm dark:bg-neutral-700 dark:text-neutral-100'
                    : 'text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200'
                }`}
              >
                全部
              </button>
              {allCategories.map(cat => {
                const config = categoryConfig[cat];
                const count = categoryCounts[cat] || 0;
                if (count === 0 && activeCategory !== cat) return null;
                return (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
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
            <div className="max-h-[260px] overflow-y-auto custom-scrollbar">
              {isSearching ? (
                <div className="flex flex-col items-center py-8">
                  <div className="h-4 w-4 rounded-full border-[1.5px] border-neutral-200 border-t-neutral-500 animate-spin dark:border-neutral-700 dark:border-t-neutral-300" />
                  <p className="mt-2 text-[12px] text-neutral-400 dark:text-neutral-500">搜索中…</p>
                </div>
              ) : filteredResults.length > 0 ? (
                <motion.div
                  initial="hidden"
                  animate="visible"
                  className="py-1"
                >
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
                        className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                          isFocused
                            ? 'bg-neutral-50 dark:bg-neutral-800/60'
                            : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/40'
                        }`}
                      >
                        {/* Category Icon */}
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-neutral-100 dark:bg-neutral-800">
                          <Icon className="h-3.5 w-3.5 text-neutral-400 dark:text-neutral-500" />
                        </div>

                        {/* Content */}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[12.5px] font-medium text-neutral-700 dark:text-neutral-200">
                            {highlightText(result.title, value)}
                          </p>
                          <p className="truncate text-[11px] text-neutral-400 dark:text-neutral-500">
                            {highlightText(result.subtitle, value)}
                          </p>
                        </div>

                        {/* Category Tag + Time */}
                        <div className="flex shrink-0 flex-col items-end gap-0.5">
                          <span className="rounded-md bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                            {config.label}
                          </span>
                          <span className="text-[10px] text-neutral-300 dark:text-neutral-600">
                            {relTime(result.timestamp)}
                          </span>
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
                </motion.div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-neutral-100 px-3 py-1.5 dark:border-neutral-800">
              <span className="text-[10px] text-neutral-300 dark:text-neutral-600">
                {filteredResults.length} 个结果
              </span>
              <div className="flex items-center gap-1 text-[10px] text-neutral-300 dark:text-neutral-600">
                <Keyboard className="h-3 w-3" />
                <span>↑↓ 导航 · Enter 选择</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
