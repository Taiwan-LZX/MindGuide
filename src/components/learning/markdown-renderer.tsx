'use client';

import React, { useState, useCallback, memo } from 'react';
import ReactMarkdown from 'react-markdown';
import { Check, Copy } from 'lucide-react';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useTheme } from 'next-themes';

// ─── Copy Button ────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      className="flex h-7 min-w-7 items-center justify-center gap-1 rounded-md px-1.5 text-neutral-400 transition-colors hover:bg-neutral-200/60 hover:text-neutral-600 dark:hover:bg-white/10 dark:hover:text-neutral-300"
      aria-label="Copy code"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-emerald-500" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

// ─── Code Block Wrapper ──────────────────────────────────────────────────────

function CodeBlockWrapper({
  children,
  language,
  code,
}: {
  children: React.ReactNode;
  language?: string;
  code?: string;
}) {
  return (
    <div className="group/code my-3 overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800/60">
      <div className="flex items-center justify-between border-b border-neutral-200/70 px-3.5 py-1.5 dark:border-white/[0.06]">
        <div className="flex items-center gap-1.5">
          {/* Mac-style traffic dots — a quiet, familiar "this is code" cue */}
          <span className="flex gap-1" aria-hidden>
            <span className="h-2 w-2 rounded-full bg-neutral-300 dark:bg-neutral-600" />
            <span className="h-2 w-2 rounded-full bg-neutral-300 dark:bg-neutral-600" />
            <span className="h-2 w-2 rounded-full bg-neutral-300 dark:bg-neutral-600" />
          </span>
          <span className="ml-1 font-mono text-[11px] font-medium lowercase tracking-tight text-neutral-500 dark:text-neutral-400">
            {language || 'code'}
          </span>
        </div>
        {code && <CopyButton text={code} />}
      </div>
      <div className="overflow-x-auto">
        {children}
      </div>
    </div>
  );
}

// ─── Syntax Highlighted Code (theme-aware) ──────────────────────────────────

function ThemedCodeBlock({ language, code }: { language: string; code: string }) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const style = isDark ? oneDark : oneLight;

  return (
    <SyntaxHighlighter
      style={style}
      language={language}
      PreTag="div"
      showLineNumbers={false}
      wrapLongLines
      customStyle={{
        margin: 0,
        padding: '1rem 1.25rem',
        borderRadius: 0,
        fontSize: '13px',
        lineHeight: '1.6',
        background: 'transparent',
      }}
      codeTagProps={{
        style: {
          fontFamily: 'var(--font-geist-mono, ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace)',
          fontSize: '13px',
        },
      }}
    >
      {code}
    </SyntaxHighlighter>
  );
}

// ─── Inline Code ───────────────────────────────────────────────────────────

function InlineCode({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLElement>) {
  if (className) return <code className={className} {...props}>{children}</code>;
  return (
    <code
      className="rounded-md bg-neutral-200/80 px-1.5 py-0.5 text-[13px] font-normal text-neutral-800 dark:bg-neutral-700 dark:text-neutral-200"
      {...props}
    >
      {children}
    </code>
  );
}

// ─── Markdown Renderer Component ────────────────────────────────────────────

export interface MarkdownRendererProps {
  content: string;
  className?: string;
  /** Enable smooth streaming transitions (kept for API compatibility) */
  streaming?: boolean;
}

export const MarkdownRenderer = memo(function MarkdownRenderer({
  content,
  className = '',
}: MarkdownRendererProps) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          code: ({ children, className: codeClassName, ...codeProps }) => {
            const match = /language-(\w+)/.exec(codeClassName || '');
            const codeString = String(children).replace(/\n$/, '');

            if (match) {
              return (
                <CodeBlockWrapper language={match[1]} code={codeString}>
                  <ThemedCodeBlock language={match[1]} code={codeString} />
                </CodeBlockWrapper>
              );
            }

            return (
              <InlineCode className={codeClassName} {...codeProps}>
                {children}
              </InlineCode>
            );
          },
          pre: ({ children }) => <>{children}</>,

          h1: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
            <h1 className="mb-2 mt-4 text-[16px] font-semibold text-neutral-900 first:mt-0 dark:text-neutral-100" {...props}>
              {children}
            </h1>
          ),
          h2: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
            <h2 className="mb-1.5 mt-3 text-[15px] font-semibold text-neutral-900 first:mt-0 dark:text-neutral-100" {...props}>
              {children}
            </h2>
          ),
          h3: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
            <h3 className="mb-1 mt-2.5 text-[14px] font-semibold text-neutral-900 first:mt-0 dark:text-neutral-100" {...props}>
              {children}
            </h3>
          ),

          p: ({ children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
            <p className="my-1.5 leading-relaxed first:mt-0 last:mb-0" {...props}>
              {children}
            </p>
          ),

          ul: ({ children, ...props }: React.HTMLAttributes<HTMLUListElement>) => (
            <ul className="my-1.5 ml-5 list-disc space-y-0.5 first:mt-0 last:mb-0" {...props}>
              {children}
            </ul>
          ),
          ol: ({ children, ...props }: React.HTMLAttributes<HTMLOListElement>) => (
            <ol className="my-1.5 ml-5 list-decimal space-y-0.5 first:mt-0 last:mb-0" {...props}>
              {children}
            </ol>
          ),
          li: ({ children, ...props }: React.HTMLAttributes<HTMLLIElement>) => (
            <li className="leading-relaxed" {...props}>
              {children}
            </li>
          ),

          blockquote: ({ children, ...props }: React.HTMLAttributes<HTMLQuoteElement>) => (
            <blockquote
              className="my-2 border-l-2 border-neutral-300 pl-3 text-[14px] text-neutral-600 dark:border-neutral-600 dark:text-neutral-400"
              {...props}
            >
              {children}
            </blockquote>
          ),

          table: ({ children, ...props }: React.HTMLAttributes<HTMLTableElement>) => (
            <div className="my-2 overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-700">
              <table className="w-full text-[13px]" {...props}>
                {children}
              </table>
            </div>
          ),
          thead: ({ children, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) => (
            <thead className="bg-neutral-100 dark:bg-neutral-800" {...props}>
              {children}
            </thead>
          ),
          th: ({ children, ...props }: React.HTMLAttributes<HTMLTableCellElement>) => (
            <th
              className="px-3 py-1.5 text-left text-[12px] font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400"
              {...props}
            >
              {children}
            </th>
          ),
          td: ({ children, ...props }: React.HTMLAttributes<HTMLTableCellElement>) => (
            <td
              className="border-t border-neutral-200 px-3 py-2 text-neutral-700 dark:border-neutral-700 dark:text-neutral-300"
              {...props}
            >
              {children}
            </td>
          ),

          hr: (props: React.HTMLAttributes<HTMLHRElement>) => (
            <hr className="my-3 border-neutral-200 dark:border-neutral-700" {...props} />
          ),

          a: ({ children, ...props }: React.HTMLAttributes<HTMLAnchorElement>) => (
            <a
              className="text-neutral-700 underline underline-offset-2 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-neutral-100"
              target="_blank"
              rel="noopener noreferrer"
              {...props}
            >
              {children}
            </a>
          ),

          strong: ({ children, ...props }: React.HTMLAttributes<HTMLElement>) => (
            <strong className="font-semibold text-neutral-900 dark:text-neutral-100" {...props}>
              {children}
            </strong>
          ),
          em: ({ children, ...props }: React.HTMLAttributes<HTMLElement>) => (
            <em className="italic" {...props}>
              {children}
            </em>
          ),

          img: ({ alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => (
            <img
              alt={alt || ''}
              className="my-2 max-w-full rounded-lg"
              loading="lazy"
              {...props}
            />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});

// ─── Copy All Button (for AI messages) ──────────────────────────────────────

export function CopyAllButton({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // silent fail
    }
  }, [content]);

  return (
    <button
      onClick={handleCopy}
      className="flex h-6 w-6 items-center justify-center rounded-md text-neutral-400 opacity-0 transition-all hover:bg-neutral-200/60 hover:text-neutral-600 group-hover:opacity-100 dark:hover:bg-neutral-700 dark:hover:text-neutral-300"
      aria-label="Copy message"
      title="Copy"
    >
      {copied ? (
        <Check className="h-3 w-3 text-emerald-500" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
    </button>
  );
}
