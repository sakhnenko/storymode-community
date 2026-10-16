import { useState, useEffect, useRef } from 'react';
import { NOTEPAD_THEMES } from '@/lib/notepad-themes';
import { GLASS_SURFACE_CLASS } from '@/components/ui/glass-surface';
import { useTranslation } from 'react-i18next';

export interface LabelData {
  text: string;
  theme: string;
  themeBg: string;
  themeFg: string;
}

interface AddLabelModalProps {
  open: boolean;
  onClose: () => void;
  onAdd: (label: LabelData) => void;
  /** When provided, modal is in edit mode */
  editData?: { text: string; theme: string } | null;
}

export function AddLabelModal({ open, onClose, onAdd, editData }: AddLabelModalProps) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [selectedTheme, setSelectedTheme] = useState(NOTEPAD_THEMES[0].id);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onClose]);

  // Sync edit data only when the modal opens (open transitions false→true)
  const prevOpenRef = useRef(false);
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      if (editData) {
        setText(editData.text);
        setSelectedTheme(editData.theme);
      } else {
        setText('');
        setSelectedTheme(NOTEPAD_THEMES[0].id);
      }
    }
    prevOpenRef.current = open;
  }, [open, editData]);

  if (!open) return null;

  const theme = NOTEPAD_THEMES.find(t => t.id === selectedTheme) || NOTEPAD_THEMES[0];
  const isEdit = !!editData;

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onAdd({
      text: trimmed,
      theme: selectedTheme,
      themeBg: theme.preview.bg,
      themeFg: theme.preview.fg,
    });
    setText('');
    setSelectedTheme(NOTEPAD_THEMES[0].id);
  };

  return (
    <div
      ref={containerRef}
      data-toolbar
      className={`absolute bottom-20 left-1/2 -translate-x-1/2 z-50 w-72 overflow-hidden ${GLASS_SURFACE_CLASS}`}
    >
      <div className="p-3 flex flex-col gap-3">
        <input
          type="text"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') handleSubmit();
            else if (e.key === 'Escape') onClose();
          }}
          placeholder={t('map.labelTextPlaceholder')}
          autoFocus
          className="w-full px-3 py-2 text-sm rounded-lg border border-border/60 bg-background/60 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
        />

        <div>
          <span className="text-xs text-muted-foreground mb-1.5 block">{t('map.theme')}</span>
          <div className="grid grid-cols-9 gap-1.5">
            {NOTEPAD_THEMES.map(th => (
              <button
                key={th.id}
                onClick={() => setSelectedTheme(th.id)}
                className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${
                  selectedTheme === th.id ? 'ring-2 ring-primary ring-offset-1 ring-offset-background scale-110' : 'border-border/50'
                }`}
                style={{ backgroundColor: th.preview.bg, borderColor: th.preview.fg + '60' }}
                title={th.name}
              />
            ))}
          </div>
        </div>

        {/* Preview */}
        <div className="flex items-center justify-center py-2">
          <div
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 shadow-sm whitespace-nowrap border-2 border-dashed"
            style={{
              backgroundColor: theme.preview.bg,
              color: theme.preview.fg,
              borderColor: theme.preview.fg + '50',
              fontSize: 12,
            }}
          >
            <span className="font-medium">{text || t('map.preview')}</span>
          </div>
        </div>

        <button
          onClick={handleSubmit}
          disabled={!text.trim()}
          className="w-full py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {isEdit ? t('map.updateLabel') : t('map.placeOnMap')}
        </button>
      </div>
    </div>
  );
}
