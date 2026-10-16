// Dev-only visual fixture. No auth, Supabase client, provider requests, or real writing.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { ProjectMemoryPanel, type ProjectMemoryController } from '@/components/story/ProjectMemoryPanel';
import type { ProjectMemory } from '../../../supabase/functions/_shared/project-memory';
import en from '@/i18n/locales/en.json';
import pt from '@/i18n/locales/pt-BR.json';
import '@/index.css';

const params = new URLSearchParams(location.search);
const i18n = createInstance();
await i18n.init({ lng: params.get('lang') || 'en', fallbackLng: 'en', resources: { en: { translation: en }, 'pt-BR': { translation: pt } }, interpolation: { escapeValue: false } });
const fixture: ProjectMemory = {
  profile: { enabled: true, register: 'auto', genre: 'Fantasy', guidance: 'Preserve the narrator’s voice.' },
  chapters: [
    { id: 'winter', title: 'Chapter 4 — Winter battle', position: 0, revision: 'r1', currentRevision: 'r1', draftId: null, writingKind: 'literary', analyzedAt: '2026-09-29T12:00:00Z', status: 'complete', overrides: {},
      claims: [{ key: 'a'.repeat(64), subject: 'Kai', kind: 'person', aliases: [], statement: 'Kai injured his left arm during the winter battle.', quote: 'Kai held his injured left arm after the winter battle.', basis: 'stated', scope: 'After the winter battle; not necessarily permanent.', related: ['Winter battle'] }] },
    { id: 'spring', title: 'Chapter 5 — Spring', position: 1, revision: 'r1', currentRevision: 'r2', draftId: null, writingKind: 'literary', analyzedAt: '2026-09-29T12:00:00Z', status: 'complete', overrides: {},
      claims: [{ key: 'b'.repeat(64), subject: 'Mara', kind: 'person', aliases: [], statement: 'Mara believes that Kai has recovered.', quote: 'Mara said that she believed Kai had fully recovered.', basis: 'reported', scope: 'Mara’s belief in spring; not independently verified.', related: ['Kai'] }] },
  ],
};
function Preview() {
  const [data, setData] = useState(fixture);
  const [open, setOpen] = useState(true);
  const [source, setSource] = useState('');
  const memory: ProjectMemoryController = {
    data, isLoading: false, isError: params.has('unavailable'), refetch: async () => {}, refresh: async () => {},
    saveProfile: async profile => {
      if (params.has('fail')) throw new Error('Synthetic save failure');
      setData(previous => ({ ...previous, profile }));
    },
    setIdentity: async () => {},
    watchAnalysis: async () => ({ cached: true }),
    editClaim: async (chapterId, key, disposition, correction = '') => {
      if (params.has('fail')) throw new Error('Synthetic save failure');
      setData(previous => ({ ...previous, chapters: previous.chapters.map(chapter => {
        if (chapter.id !== chapterId) return chapter;
        const overrides = { ...chapter.overrides };
        if (disposition === 'extracted') delete overrides[key];
        else overrides[key] = { disposition: disposition as 'confirmed' | 'corrected' | 'excluded', correction };
        return { ...chapter, overrides };
      }) }));
    },
    analyze: async chapterId => {
      if (params.has('fail')) throw new Error('sourceChanged');
      setData(previous => ({ ...previous, chapters: previous.chapters.map(chapter => chapter.id === chapterId ? { ...chapter, revision: chapter.currentRevision } : chapter) }));
      return { count: 1, rejected: 0 };
    },
  };
  return <I18nextProvider i18n={i18n}>
    <main className="p-8"><h1>Synthetic UI fixture — no real writing or credits</h1><button onClick={() => setOpen(true)}>Open project memory</button><p>Source opened: {source || 'none'}</p></main>
    <ProjectMemoryPanel projectId="fixture" chapterId="winter" open={open} onOpenChange={setOpen} onSelectChapter={setSource} memory={memory} />
  </I18nextProvider>;
}
if (import.meta.env.DEV) createRoot(document.getElementById('root')!).render(<Preview />);
