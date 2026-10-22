import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Check } from '@/components/ui/icons';
import type { GraphNode } from '../../../supabase/functions/_shared/memory-graph';
import { FAINT_BUTTON } from './codex-meta';

/**
 * "Inside of…" for a place: the place that contains it, from memory's
 * "located in" links or as the author set it here or by dragging in Journeys.
 */
export function CodexContainer({ parent, options, onChange }: {
  parent: GraphNode | null;
  /** Places it can go inside: not itself, nor any place inside it. */
  options: GraphNode[];
  onChange: (parentId: string | null) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const choose = (id: string | null) => { onChange(id); setOpen(false); };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={FAINT_BUTTON} title={parent ? t('codex.insidePlace', { name: parent.name }) : undefined}>
          <span className="truncate">{parent ? t('codex.insidePlace', { name: parent.name }) : t('codex.insideOf')}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0 font-sans">
        <Command>
          <CommandInput placeholder={t('codex.insideSearch')} />
          <CommandList>
            <CommandEmpty>{t('codex.insideNone')}</CommandEmpty>
            {parent && (
              <CommandGroup>
                <CommandItem value="-" onSelect={() => choose(null)} className="opacity-70">{t('codex.insideNothing')}</CommandItem>
              </CommandGroup>
            )}
            <CommandGroup>
              {options.map(place => (
                <CommandItem key={place.id} value={[place.name, ...place.aliases].join(' · ')} onSelect={() => choose(place.id)}>
                  <span className="min-w-0 flex-1 truncate">{place.name}</span>
                  {place.id === parent?.id && <Check weight="bold" aria-hidden="true" className="h-3.5 w-3.5 opacity-60" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
