import type { Editor, Extensions } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Markdown } from 'tiptap-markdown';

// What chapters and notebooks share as editors: the same formatting (StarterKit
// 3 includes underline and links) and the same Markdown they save, so text
// moves between them unchanged.

/** The shared editor features; `extra` adds a surface's own, such as review highlights. */
export function storyEditorExtensions(placeholder: string, extra: Extensions = []): Extensions {
  return [
    StarterKit.configure({ heading: { levels: [1, 2, 3, 4] } }),
    ...extra,
    Placeholder.configure({ placeholder }),
    Markdown.configure({ html: false, linkify: true, breaks: true, transformPastedText: true }),
  ];
}

type MarkdownStorage = { markdown?: { getMarkdown?: () => string } };

/** The editor's text as the Markdown it saves, or undefined before the extension is ready. */
export function editorMarkdown(editor: Editor | null | undefined): string | undefined {
  return (editor?.storage as MarkdownStorage | undefined)?.markdown?.getMarkdown?.();
}
