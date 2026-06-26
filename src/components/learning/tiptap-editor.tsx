'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import Mathematics from '@tiptap/extension-mathematics';
import Highlight from '@tiptap/extension-highlight';
import Color from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import Underline from '@tiptap/extension-underline';
import Image from '@tiptap/extension-image';
import CharacterCount from '@tiptap/extension-character-count';
import Typography from '@tiptap/extension-typography';
import { common, createLowlight } from 'lowlight';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListChecks,
  Code2,
  Quote,
  Link as LinkIcon,
  Highlighter,
  Sigma,
  Undo2,
  Redo2,
  Unlink,
  X,
  Check,
  Cloud,
  CloudOff,
  Loader2,
} from 'lucide-react';
import { useLearningStore } from '@/store/learning-store';

// ─── Lowlight Setup ──────────────────────────────────────────────────────────

const lowlight = createLowlight(common);

// ─── Toolbar Button ──────────────────────────────────────────────────────────

interface ToolbarButtonProps {
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  title: string;
}

function ToolbarButton({ onClick, isActive, disabled, children, title }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors
        ${isActive
          ? 'bg-neutral-200 text-neutral-800 dark:bg-neutral-600 dark:text-neutral-100'
          : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-700 dark:hover:text-neutral-200'
        }
        ${disabled ? 'pointer-events-none opacity-40' : ''}
      `}
    >
      {children}
    </button>
  );
}

// ─── Toolbar Divider ─────────────────────────────────────────────────────────

function ToolbarDivider() {
  return <div className="mx-1 h-5 w-px bg-neutral-200 dark:bg-neutral-700" />;
}

// ─── Link Dialog ─────────────────────────────────────────────────────────────

function LinkDialog({
  onSubmit,
  onClose,
  initialUrl,
}: {
  onSubmit: (url: string) => void;
  onClose: () => void;
  initialUrl?: string;
}) {
  const [url, setUrl] = useState(initialUrl || '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) {
      onSubmit(url.trim());
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="absolute top-full left-1/2 z-50 mt-1 flex w-64 -translate-x-1/2 items-center gap-1.5 rounded-lg border border-neutral-200 bg-white p-1.5 shadow-lg dark:border-neutral-700 dark:bg-neutral-800"
    >
      <input
        ref={inputRef}
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://..."
        className="h-7 flex-1 rounded-md border border-neutral-200 bg-neutral-50 px-2 text-[12px] text-neutral-700 placeholder:text-neutral-400 focus:border-neutral-300 focus:outline-none dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-200 dark:placeholder:text-neutral-500"
      />
      <button
        type="submit"
        className="flex h-7 w-7 items-center justify-center rounded-md bg-neutral-900 text-white transition-colors hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
      >
        <Check className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={onClose}
        className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-700 dark:hover:text-neutral-300"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </form>
  );
}

// ─── Math Dialog ─────────────────────────────────────────────────────────────

function MathDialog({
  onSubmit,
  onClose,
}: {
  onSubmit: (latex: string) => void;
  onClose: () => void;
}) {
  const [latex, setLatex] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (latex.trim()) {
      onSubmit(latex.trim());
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="absolute top-full right-0 z-50 mt-1 flex w-72 items-center gap-1.5 rounded-lg border border-neutral-200 bg-white p-1.5 shadow-lg dark:border-neutral-700 dark:bg-neutral-800"
    >
      <span className="shrink-0 text-[12px] text-neutral-400 pl-1">$</span>
      <input
        ref={inputRef}
        type="text"
        value={latex}
        onChange={(e) => setLatex(e.target.value)}
        placeholder="E=mc^2"
        className="h-7 flex-1 rounded-md border border-neutral-200 bg-neutral-50 px-2 text-[12px] font-mono text-neutral-700 placeholder:text-neutral-400 focus:border-neutral-300 focus:outline-none dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-200 dark:placeholder:text-neutral-500"
      />
      <span className="shrink-0 text-[12px] text-neutral-400">$</span>
      <button
        type="submit"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-neutral-900 text-white transition-colors hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
      >
        <Check className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={onClose}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-700 dark:hover:text-neutral-300"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </form>
  );
}

// ─── Save Status Indicator ───────────────────────────────────────────────────

function SaveStatusIndicator({ status }: { status: 'idle' | 'saving' | 'saved' | 'error' }) {
  if (status === 'saving') {
    return (
      <div className="flex items-center gap-1.5 text-[11px] text-neutral-400 dark:text-neutral-500">
        <Loader2 className="h-3 w-3 animate-spin" />
        <span>保存中...</span>
      </div>
    );
  }
  if (status === 'saved') {
    return (
      <div className="flex items-center gap-1.5 text-[11px] text-neutral-500 dark:text-neutral-400">
        <Check className="h-3 w-3" strokeWidth={3} />
        <span>已保存</span>
      </div>
    );
  }
  if (status === 'error') {
    return (
      <div className="flex items-center gap-1.5 text-[11px] text-red-500 dark:text-red-400">
        <CloudOff className="h-3 w-3" />
        <span>保存失败</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-neutral-300 dark:text-neutral-600">
      <Cloud className="h-3 w-3" />
      <span>自动保存</span>
    </div>
  );
}

// ─── Main Editor Component ───────────────────────────────────────────────────

export default function TiptapEditor() {
  const { notesContent, setNotesContent, currentSessionId, notesSaveStatus } = useLearningStore();
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [linkDialogInitialUrl, setLinkDialogInitialUrl] = useState('');
  const [showMathDialog, setShowMathDialog] = useState(false);
  const linkDialogAnchorRef = useRef<HTMLDivElement>(null);
  // Track whether content changes originate from the editor itself (vs external load)
  const isInternalChange = useRef(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false, // We use CodeBlockLowlight instead
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Placeholder.configure({
        placeholder: '开始记录你的学习笔记...',
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-neutral-700 underline decoration-neutral-400 underline-offset-2 dark:text-neutral-300 dark:decoration-neutral-500 hover:decoration-neutral-600 dark:hover:decoration-neutral-400',
        },
      }),
      TaskList.configure({
        HTMLAttributes: {
          class: 'pl-1',
        },
      }),
      TaskItem.configure({
        nested: true,
        HTMLAttributes: {
          class: 'flex items-start gap-2 my-0.5',
        },
      }),
      CodeBlockLowlight.configure({
        lowlight,
        HTMLAttributes: {
          class: 'rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-[13px] font-mono dark:border-neutral-700 dark:bg-neutral-800/80',
        },
      }),
      Mathematics,
      Highlight.configure({
        multicolor: false,
        HTMLAttributes: {
          class: 'bg-yellow-100/70 dark:bg-yellow-900/30 rounded-sm px-0.5',
        },
      }),
      Color,
      TextStyle,
      Underline,
      Image,
      CharacterCount,
      Typography,
    ],
    content: notesContent || '',
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      isInternalChange.current = true;
      setNotesContent(html);
    },
    editorProps: {
      attributes: {
        class: 'prose-sm prose-neutral max-w-none focus:outline-none dark:prose-invert prose-headings:font-semibold prose-headings:text-neutral-900 dark:prose-headings:text-neutral-100 prose-p:text-neutral-700 dark:prose-p:text-neutral-300 prose-li:text-neutral-700 dark:prose-li:text-neutral-300 prose-strong:text-neutral-900 dark:prose-strong:text-neutral-100 prose-blockquote:border-l-neutral-400 dark:prose-blockquote:border-l-neutral-600 prose-pre:bg-transparent prose-pre:p-0 prose-pre:border-0 prose-code:after:content-none prose-code:before:content-none prose-code:text-neutral-700 dark:prose-code:text-neutral-300 prose-a:text-neutral-700 dark:prose-a:text-neutral-300 prose-img:rounded-lg prose-img:border prose-img:border-neutral-200 dark:prose-img:border-neutral-700',
      },
    },
    immediatelyRender: false,
  });

  // Auto-focus on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      editor?.commands.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, [editor]);

  // Sync editor content when session changes (external content swap)
  // We compare to current HTML to avoid clobbering the user's caret during normal typing.
  useEffect(() => {
    if (!editor) return;
    if (isInternalChange.current) {
      isInternalChange.current = false;
      return;
    }
    const currentHtml = editor.getHTML();
    if ((notesContent || '') !== currentHtml) {
      // Tiptap v3: setContent takes an options object (was `(html, emitUpdate, parseOptions)` in v2).
      editor.commands.setContent(notesContent || '', { emitUpdate: false });
    }
  }, [notesContent, currentSessionId, editor]);

  // Close dialogs on outside click
  useEffect(() => {
    if (!showLinkDialog && !showMathDialog) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-link-dialog]') && !target.closest('[data-math-dialog]') && !target.closest('button')) {
        setShowLinkDialog(false);
        setShowMathDialog(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showLinkDialog, showMathDialog]);

  // Close dialogs on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowLinkDialog(false);
        setShowMathDialog(false);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const setLink = useCallback(
    (url: string) => {
      if (!editor) return;
      // If already a link, update it
      if (editor.isActive('link')) {
        editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
      } else {
        editor.chain().focus().setLink({ href: url }).run();
      }
      setShowLinkDialog(false);
    },
    [editor],
  );

  const handleMathSubmit = useCallback(
    (latex: string) => {
      if (!editor) return;
      editor.chain().focus().insertContent(`$${latex}$`).run();
      setShowMathDialog(false);
    },
    [editor],
  );

  const handleLinkClick = useCallback(() => {
    if (!editor) return;
    if (editor.isActive('link')) {
      const prevUrl = editor.getAttributes('link').href || '';
      setLinkDialogInitialUrl(prevUrl);
    } else {
      setLinkDialogInitialUrl('');
    }
    setShowLinkDialog(true);
    setShowMathDialog(false);
  }, [editor]);

  const handleMathClick = useCallback(() => {
    setShowMathDialog(true);
    setShowLinkDialog(false);
  }, []);

  if (!editor) return null;

  const characterCount = editor.storage.characterCount;

  return (
    <>
      {/* Toolbar */}
      <div className="flex h-11 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-neutral-200 bg-neutral-50 px-2 dark:border-neutral-700 dark:bg-neutral-800/50">
        {/* Undo / Redo */}
        <ToolbarButton onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="撤销 (Ctrl+Z)">
          <Undo2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="重做 (Ctrl+Shift+Z)">
          <Redo2 className="h-4 w-4" />
        </ToolbarButton>

        <ToolbarDivider />

        {/* Text Formatting */}
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          isActive={editor.isActive('bold')}
          title="加粗 (Ctrl+B)"
        >
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          isActive={editor.isActive('italic')}
          title="斜体 (Ctrl+I)"
        >
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          isActive={editor.isActive('underline')}
          title="下划线 (Ctrl+U)"
        >
          <UnderlineIcon className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleStrike().run()}
          isActive={editor.isActive('strike')}
          title="删除线 (Ctrl+Shift+S)"
        >
          <Strikethrough className="h-4 w-4" />
        </ToolbarButton>

        <ToolbarDivider />

        {/* Headings */}
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          isActive={editor.isActive('heading', { level: 1 })}
          title="标题 1"
        >
          <Heading1 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          isActive={editor.isActive('heading', { level: 2 })}
          title="标题 2"
        >
          <Heading2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          isActive={editor.isActive('heading', { level: 3 })}
          title="标题 3"
        >
          <Heading3 className="h-4 w-4" />
        </ToolbarButton>

        <ToolbarDivider />

        {/* Lists */}
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          isActive={editor.isActive('bulletList')}
          title="无序列表"
        >
          <List className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          isActive={editor.isActive('orderedList')}
          title="有序列表"
        >
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleTaskList().run()}
          isActive={editor.isActive('taskList')}
          title="任务列表"
        >
          <ListChecks className="h-4 w-4" />
        </ToolbarButton>

        <ToolbarDivider />

        {/* Code & Quote */}
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          isActive={editor.isActive('codeBlock')}
          title="代码块"
        >
          <Code2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          isActive={editor.isActive('blockquote')}
          title="引用块"
        >
          <Quote className="h-4 w-4" />
        </ToolbarButton>

        <ToolbarDivider />

        {/* Link */}
        <div className="relative" ref={linkDialogAnchorRef}>
          <ToolbarButton onClick={handleLinkClick} isActive={editor.isActive('link')} title="插入链接">
            <LinkIcon className="h-4 w-4" />
          </ToolbarButton>
          {editor.isActive('link') && (
            <ToolbarButton onClick={() => editor.chain().focus().unsetLink().run()} title="移除链接">
              <Unlink className="h-4 w-4" />
            </ToolbarButton>
          )}
          {showLinkDialog && (
            <div data-link-dialog>
              <LinkDialog
                onSubmit={setLink}
                onClose={() => setShowLinkDialog(false)}
                initialUrl={linkDialogInitialUrl}
              />
            </div>
          )}
        </div>

        {/* Highlight */}
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHighlight().run()}
          isActive={editor.isActive('highlight')}
          title="高亮标记"
        >
          <Highlighter className="h-4 w-4" />
        </ToolbarButton>

        {/* Math */}
        <div className="relative">
          <ToolbarButton onClick={handleMathClick} title="数学公式 ($...$)">
            <Sigma className="h-4 w-4" />
          </ToolbarButton>
          {showMathDialog && (
            <div data-math-dialog>
              <MathDialog
                onSubmit={handleMathSubmit}
                onClose={() => setShowMathDialog(false)}
              />
            </div>
          )}
        </div>
      </div>

      {/* Editor Area */}
      <div className="flex flex-1 flex-col overflow-hidden bg-white dark:bg-neutral-900">
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="mx-auto max-w-[720px] px-6 py-5 sm:px-10">
            <EditorContent editor={editor} />
          </div>
        </div>

        {/* Character Count + Save Status */}
        <div className="flex shrink-0 items-center justify-between px-6 py-2">
          <SaveStatusIndicator status={notesSaveStatus} />
          <span className="text-[11px] tabular-nums text-neutral-300 dark:text-neutral-600">
            {characterCount.characters()} 字符
          </span>
        </div>
      </div>
    </>
  );
}
