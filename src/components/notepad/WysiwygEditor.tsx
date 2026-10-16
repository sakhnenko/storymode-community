import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { editorMarkdown, storyEditorExtensions } from '@/lib/story-editor';
import { cn } from '@/lib/utils';
import {
  TextB, TextItalic, TextUnderline, ListBullets, ListNumbers, TextIndent, TextHOne, TextHTwo, Minus,
} from '@/components/ui/icons';
import { ADAPTIVE_SURFACE_BASE, useContentAdaptiveSurface } from '@/components/ui/adaptive-surface';

interface Props {
  value: string;
  onChange: (markdown: string) => void;
  onBlur?: () => void;
  onFocus?: () => void;
  placeholder?: string;
  className?: string;
  editable?: boolean;
  autoFocus?: boolean;
}

export interface WysiwygEditorHandle {
  editor: Editor | null;
  focus: () => void;
  focusAtEnd: () => void;
  scrollToText: (text: string) => void;
  getDom: () => HTMLElement | null;
}


/**
 * Always-visible WYSIWYG markdown editor (Tiptap + tiptap-markdown).
 * Bold/italic/lists render visibly while typing, no separate view mode.
 * Reads & writes markdown as its value contract.
 */
export const WysiwygEditor = forwardRef<WysiwygEditorHandle, Props>(function WysiwygEditor(
  { value, onChange, onBlur, onFocus, placeholder, className, editable = true, autoFocus },
  ref,
) {
  const { t } = useTranslation();
  const dirtyRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const bubbleSurface = useContentAdaptiveSurface(bubbleRef, 'auto');

  const editor = useEditor({
    // Underline comes with the shared StarterKit; adding it again registered it twice.
    extensions: storyEditorExtensions(placeholder || ''),
    content: value || '',
    editable,
    autofocus: autoFocus,
    editorProps: {
      attributes: { class: cn('focus:outline-none', className) },
    },
    onUpdate: ({ editor }) => {
      dirtyRef.current = true;
      const md = editorMarkdown(editor) ?? editor.getText();
      onChange(md);
    },
    onBlur: () => onBlur?.(),
    onFocus: () => onFocus?.(),
  });

  useEffect(() => { editor?.setEditable(editable); }, [editor, editable]);

  // Ensure the initial value is parsed as markdown (tiptap's `content` option
  // on useEditor doesn't always run it through the markdown parser, which can
  // leave raw asterisks / list markers visible until the next edit).
  const initializedRef = useRef(false);
  useEffect(() => {
    if (!editor) return;
    if (!initializedRef.current) {
      initializedRef.current = true;
      editor.commands.setContent(value || '', { emitUpdate: false });
      return;
    }
    const currentMd = editorMarkdown(editor) ?? '';
    if (currentMd === value) { dirtyRef.current = false; return; }
    if (dirtyRef.current) { dirtyRef.current = false; return; }
    editor.commands.setContent(value || '', { emitUpdate: false });
  }, [value, editor]);

  useImperativeHandle(ref, () => ({
    editor,
    focus: () => editor?.commands.focus(),
    focusAtEnd: () => editor?.chain().focus('end').run(),
    getDom: () => containerRef.current,
    scrollToText: (text: string) => {
      if (!editor || !text) return;
      const doc = editor.state.doc;
      const haystack = doc.textBetween(0, doc.content.size, '\n', '\n').toLowerCase();
      const idx = haystack.indexOf(text.toLowerCase());
      if (idx < 0) return;

      // Walk doc to map plaintext offset -> doc position.
      let pos = 0;
      let remaining = idx;
      let consumed = 0;
      doc.descendants((node, p) => {
        if (remaining <= 0) return false;
        if (node.isText) {
          const len = (node.text || '').length;
          if (len >= remaining) { pos = p + remaining; remaining = 0; return false; }
          remaining -= len; consumed += len;
        } else if (node.isBlock && consumed > 0) {
          if (remaining <= 1) { pos = p + 1; remaining = 0; return false; }
          remaining -= 1; consumed += 1;
        }
        return true;
      });

      try {
        editor.commands.setTextSelection({ from: pos, to: Math.min(pos + text.length, doc.content.size) });
        editor.commands.focus();
        const dom = editor.view.domAtPos(pos);
        const el = dom.node.nodeType === 1
          ? (dom.node as HTMLElement)
          : (dom.node.parentElement as HTMLElement | null);
        el?.scrollIntoView({ block: 'center' });
      } catch {
        /* noop */
      }
    },
  }), [editor]);

  const focusAtEnd = () => {
    if (!editor || !editable) return;
    editor.chain().focus('end').run();
  };

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      onMouseDown={(e) => {
        // If user clicks the blank area around/below the prose content,
        // route focus into the editor at the end of the document.
        if (e.target === e.currentTarget) {
          e.preventDefault();
          focusAtEnd();
        }
      }}
    >
      <EditorContent editor={editor} className="min-h-full" />
      {editor && editable && (
        <BubbleMenu editor={editor} options={{ placement: 'top' }}>
          <div
            ref={bubbleRef}
            data-surface={bubbleSurface}
            data-wysiwyg-bubble="true"
            className={cn(
              'flex items-center gap-0.5 rounded-lg px-1 py-1',
              ADAPTIVE_SURFACE_BASE,
            )}
          >
            <BubbleBtn surface={bubbleSurface} label={t('notepad.editor.bold')} active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
              <TextB weight="bold" className="w-4 h-4" />
            </BubbleBtn>
            <BubbleBtn surface={bubbleSurface} label={t('notepad.editor.italic')} active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
              <TextItalic weight="bold" className="w-4 h-4" />
            </BubbleBtn>
            <BubbleBtn surface={bubbleSurface} label={t('notepad.editor.underline')} active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}>
              <TextUnderline weight="bold" className="w-4 h-4" />
            </BubbleBtn>
            <span className="mx-0.5 h-5 w-px bg-current/20" aria-hidden />
            <BubbleBtn surface={bubbleSurface} label={t('notepad.editor.heading1')} active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
              <TextHOne weight="bold" className="w-4 h-4" />
            </BubbleBtn>
            <BubbleBtn surface={bubbleSurface} label={t('notepad.editor.heading2')} active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
              <TextHTwo weight="bold" className="w-4 h-4" />
            </BubbleBtn>
            <span className="mx-0.5 h-5 w-px bg-current/20" aria-hidden />
            <BubbleBtn surface={bubbleSurface} label={t('notepad.editor.bulletList')} active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>
              <ListBullets weight="bold" className="w-4 h-4" />
            </BubbleBtn>
            <BubbleBtn surface={bubbleSurface} label={t('notepad.editor.orderedList')} active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
              <ListNumbers weight="bold" className="w-4 h-4" />
            </BubbleBtn>
            <BubbleBtn surface={bubbleSurface} label={t('notepad.editor.blockquote')} active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
              <TextIndent weight="bold" className="w-4 h-4" />
            </BubbleBtn>
            <BubbleBtn surface={bubbleSurface} label={t('notepad.editor.horizontalRule')} onClick={() => editor.chain().focus().setHorizontalRule().run()}>
              <Minus weight="bold" className="w-4 h-4" />
            </BubbleBtn>
          </div>
        </BubbleMenu>
      )}
    </div>
  );
});

function BubbleBtn({
  label, onClick, active, children, surface,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
  surface?: 'light' | 'dark';
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      className={cn(
        'h-7 w-7 inline-flex items-center justify-center rounded transition-colors',
        surface === 'dark' ? 'hover:bg-white/10' : 'hover:bg-black/[0.06]',
        active && (surface === 'dark' ? 'bg-white/15' : 'bg-black/[0.08]'),
      )}
    >
      {children}
    </button>
  );
}