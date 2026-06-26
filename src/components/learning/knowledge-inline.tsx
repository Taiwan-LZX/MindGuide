'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { useLearningStore, type KnowledgeNode } from '@/store/learning-store';

// ─── Animation Variants ─────────────────────────────────────────────────────

const nodeVariants = {
  hidden: { opacity: 0, x: -8 },
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: {
      delay: 0.06 + 0.035 * i,
      type: 'spring' as const,
      stiffness: 380,
      damping: 28,
      mass: 0.7,
    },
  }),
};

// ─── Component ───────────────────────────────────────────────────────────────

export function KnowledgeInline({ nodes }: { nodes: KnowledgeNode[] }) {
  const { toggleKnowledgeMastered } = useLearningStore();
  // BUG FIX (P2-#33): collapse toggle so >5 nodes don't permanently occupy
  // a large chunk of the conversation thread. Collapsed by default when
  // there are many nodes; expanded by default when ≤5.
  const [collapsed, setCollapsed] = useState(nodes.length > 5);

  if (nodes.length === 0) return null;

  const mastered = nodes.filter(n => n.mastered).length;
  const pct = nodes.length > 0 ? (mastered / nodes.length) * 100 : 0;
  const visibleNodes = collapsed ? nodes.slice(0, 3) : nodes;
  const hiddenCount = nodes.length - visibleNodes.length;

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="mb-3 flex items-center justify-between">
        <button
          onClick={() => setCollapsed(c => !c)}
          className="flex items-center gap-1.5 text-[12px] font-medium text-neutral-500 transition-colors hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
          aria-label={collapsed ? '展开知识节点' : '收起知识节点'}
        >
          <motion.div
            animate={{ rotate: collapsed ? 0 : 90 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30, mass: 0.6 }}
          >
            <ChevronDown className="h-3 w-3" />
          </motion.div>
          学习进度 · {mastered}/{nodes.length}
        </button>
        <div className="h-1 w-24 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
          <motion.div
            className="h-full rounded-full bg-neutral-900 dark:bg-white"
            style={{ transformOrigin: 'left' }}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: Math.max(0, Math.min(1, pct / 100)) }}
            transition={{ type: 'spring', stiffness: 300, damping: 25, delay: 0.2 }}
          />
        </div>
      </div>

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ height: { duration: 0.22, ease: [0.16, 1, 0.3, 1] }, opacity: { duration: 0.14 } }}
            className="overflow-hidden"
          >
            <div className="space-y-1.5">
              {nodes.map((node, i) => (
                <motion.div
                  key={node.id}
                  custom={i}
                  variants={nodeVariants}
                  initial="hidden"
                  animate="visible"
                  whileTap={{
                    scale: 0.99,
                    transition: { type: 'spring', stiffness: 600, damping: 25 },
                  }}
                  className={`flex items-center gap-2 rounded-md px-2.5 py-2 text-[13px] transition-colors ${
                    node.mastered
                      ? 'bg-neutral-50 text-neutral-400 dark:bg-neutral-800 dark:text-neutral-500'
                      : 'bg-neutral-50 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200'
                  }`}
                >
                  <motion.button
                    whileTap={{
                      scale: 0.85,
                      transition: { type: 'spring', stiffness: 600, damping: 18 },
                    }}
                    onClick={() => toggleKnowledgeMastered(node.id)}
                    className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-neutral-300 transition-colors dark:border-neutral-600"
                  >
                    <AnimatePresence>
                      {node.mastered && (
                        <motion.svg
                          width="10" height="8" viewBox="0 0 10 8" fill="none"
                          className="text-neutral-900 dark:text-neutral-100"
                          initial={{ scale: 0, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0, opacity: 0 }}
                          transition={{ type: 'spring', stiffness: 500, damping: 20 }}
                        >
                          <path d="M1 4L3.5 6.5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </motion.svg>
                      )}
                    </AnimatePresence>
                  </motion.button>
                  <span className={node.mastered ? 'line-through' : ''}>{node.title}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Collapsed summary — shows first 3 node titles + "+N more" */}
      {collapsed && (
        <div className="space-y-1">
          {visibleNodes.map(node => (
            <div key={node.id} className="flex items-center gap-2 px-2.5 py-1.5 text-[12px] text-neutral-400 dark:text-neutral-500">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${node.mastered ? 'bg-[var(--brand)]' : 'bg-neutral-300 dark:bg-neutral-600'}`} />
              <span className="truncate">{node.title}</span>
            </div>
          ))}
          {hiddenCount > 0 && (
            <button
              onClick={() => setCollapsed(false)}
              className="px-2.5 py-1 text-[11px] text-neutral-400 transition-colors hover:text-neutral-700 dark:text-neutral-500 dark:hover:text-neutral-200"
            >
              +{hiddenCount} 个知识点 · 点击展开
            </button>
          )}
        </div>
      )}
    </div>
  );
}
