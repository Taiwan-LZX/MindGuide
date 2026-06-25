'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLearningStore, type KnowledgeNode } from '@/store/learning-store';

// ─── Animation Variants ─────────────────────────────────────────────────────

const nodeVariants = {
  hidden: { opacity: 0, x: -8 },
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: { delay: 0.04 * i, duration: 0.25, ease: [0.25, 0.1, 0.25, 1] },
  }),
};

// ─── Component ───────────────────────────────────────────────────────────────

export function KnowledgeInline({ nodes }: { nodes: KnowledgeNode[] }) {
  const { toggleKnowledgeMastered } = useLearningStore();

  if (nodes.length === 0) return null;

  const mastered = nodes.filter(n => n.mastered).length;
  const pct = nodes.length > 0 ? (mastered / nodes.length) * 100 : 0;

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[12px] font-medium text-neutral-500 dark:text-neutral-400">
          学习进度 · {mastered}/{nodes.length}
        </span>
        <div className="h-1 w-24 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
          <motion.div
            className="h-full rounded-full bg-neutral-900 dark:bg-white"
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ type: 'spring', stiffness: 300, damping: 25, delay: 0.2 }}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        {nodes.map((node, i) => (
          <motion.div
            key={node.id}
            custom={i}
            variants={nodeVariants}
            initial="hidden"
            animate="visible"
            whileTap={{ scale: 0.99 }}
            className={`flex items-center gap-2 rounded-md px-2.5 py-2 text-[13px] transition-colors ${
              node.mastered
                ? 'bg-neutral-50 text-neutral-400 dark:bg-neutral-800 dark:text-neutral-500'
                : 'bg-neutral-50 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200'
            }`}
          >
            <motion.button
              whileTap={{ scale: 0.85 }}
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
    </div>
  );
}
