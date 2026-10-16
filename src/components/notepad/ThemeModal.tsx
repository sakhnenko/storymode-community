import { useEffect, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from '@/components/ui/icons';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { NOTEPAD_THEMES, NOTEPAD_FONTS, NOTEPAD_FONT_SIZES, NotepadTheme, NotepadFont, NotepadFontSize } from '@/lib/notepad-themes';
import { cn } from '@/lib/utils';
import { Check } from '@/components/ui/icons';
import { useTranslation } from 'react-i18next';

interface ThemeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentTheme: string;
  currentFont: string;
  currentFontSize: string;
  onThemeChange: (themeId: string) => void;
  onFontChange: (fontId: string) => void;
  onFontSizeChange: (fontSizeId: string) => void;
}

export function ThemeModal({
  open,
  onOpenChange,
  currentTheme,
  currentFont,
  currentFontSize,
  onThemeChange,
  onFontChange,
  onFontSizeChange,
}: ThemeModalProps) {
  const { t } = useTranslation();
  // Separate themes into light and dark
  const lightThemes = NOTEPAD_THEMES.slice(0, 10);
  const darkThemes = NOTEPAD_THEMES.slice(10);
  const [pendingTheme, setPendingTheme] = useState(currentTheme);
  const [pendingFont, setPendingFont] = useState(currentFont);
  const [pendingFontSize, setPendingFontSize] = useState(currentFontSize);

  useEffect(() => {
    if (!open) return;
    setPendingTheme(currentTheme);
    setPendingFont(currentFont);
    setPendingFontSize(currentFontSize);
  }, [open, currentTheme, currentFont, currentFontSize]);

  const handleApply = () => {
    const nextTheme = pendingTheme;
    const nextFont = pendingFont;
    const nextFontSize = pendingFontSize;

    onOpenChange(false);

    window.setTimeout(() => {
      if (nextTheme !== currentTheme) onThemeChange(nextTheme);
      if (nextFont !== currentFont) onFontChange(nextFont);
      if (nextFontSize !== currentFontSize) onFontSizeChange(nextFontSize);
    }, 0);
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay forceMount className="fixed inset-0 z-[70] bg-black/40 transition-none duration-0 data-[state=closed]:pointer-events-none data-[state=closed]:opacity-0" />
        <DialogPrimitive.Content forceMount className="fixed left-[50%] top-[50%] z-[70] flex max-h-[85vh] w-full max-w-lg translate-x-[-50%] translate-y-[-50%] flex-col gap-5 overflow-hidden rounded-2xl border border-border/50 bg-background p-6 shadow-2xl shadow-black/20 transition-none duration-0 data-[state=closed]:pointer-events-none data-[state=closed]:opacity-0">
        <div className="flex flex-col space-y-2 flex-shrink-0">
          <DialogPrimitive.Title className="text-lg font-medium leading-none tracking-tight">{t('notepad.theme.changeTheme')}</DialogPrimitive.Title>
        </div>

        <ScrollArea className="flex-1 pr-3 -mr-3 [&>[data-radix-scroll-area-viewport]]:max-h-[55vh]">
          <div className="space-y-5 py-3 pr-1">
            {/* Theme Selection */}
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('notepad.theme.lightThemes')}</Label>
              <div className="grid grid-cols-5 gap-1.5">
                {lightThemes.map((theme) => (
                  <ThemeButton
                    key={theme.id}
                    theme={theme}
                    isSelected={pendingTheme === theme.id}
                    onClick={() => setPendingTheme(theme.id)}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('notepad.theme.darkThemes')}</Label>
              <div className="grid grid-cols-5 gap-1.5">
                {darkThemes.map((theme) => (
                  <ThemeButton
                    key={theme.id}
                    theme={theme}
                    isSelected={pendingTheme === theme.id}
                    onClick={() => setPendingTheme(theme.id)}
                  />
                ))}
              </div>
            </div>

            {/* Font Size Selection */}
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('notepad.theme.fontSize')}</Label>
              <div className="flex gap-1.5">
                {NOTEPAD_FONT_SIZES.map((size) => (
                  <FontSizeButton
                    key={size.id}
                    size={size}
                    isSelected={pendingFontSize === size.id}
                    onClick={() => setPendingFontSize(size.id)}
                  />
                ))}
              </div>
            </div>

            {/* Font Selection */}
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('notepad.theme.font')}</Label>
              <div className="space-y-1.5">
                {NOTEPAD_FONTS.map((font) => (
                  <FontButton
                    key={font.id}
                    font={font}
                    isSelected={pendingFont === font.id}
                    onClick={() => setPendingFont(font.id)}
                  />
                ))}
              </div>
            </div>
          </div>
        </ScrollArea>
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border/60 pt-4">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              {t('notepad.theme.cancel')}
            </Button>
            <Button size="sm" onClick={handleApply}>
              {t('notepad.theme.apply')}
            </Button>
          </div>
          <DialogPrimitive.Close className="absolute right-4 top-4 rounded-full p-1.5 opacity-50 transition-opacity hover:opacity-100 focus:outline-none">
            <X weight="bold" className="h-4 w-4" />
            <span className="sr-only">{t('notepad.theme.close')}</span>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function ThemeButton({
  theme,
  isSelected,
  onClick,
}: {
  theme: NotepadTheme;
  isSelected: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center gap-0.5">
      <button
        onClick={onClick}
        className={cn(
          'relative w-full aspect-square rounded-md border transition-all duration-200 overflow-hidden',
          isSelected
            ? 'ring-2 ring-primary/30 ring-offset-1 ring-offset-background'
            : 'hover:scale-105'
        )}
        style={{ 
          backgroundColor: theme.preview.bg,
          borderColor: isSelected ? theme.preview.fg : `${theme.preview.fg}30`
        }}
      >
        {isSelected && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Check weight="bold" className="w-3 h-3" style={{ color: theme.preview.fg }} />
          </div>
        )}
      </button>
      <span className="text-[9px] text-muted-foreground truncate w-full text-center">{t(theme.labelKey)}</span>
    </div>
  );
}

function FontSizeButton({
  size,
  isSelected,
  onClick,
}: {
  size: NotepadFontSize;
  isSelected: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex-1 flex flex-col items-center gap-1 px-3 py-2 rounded-lg border transition-all duration-200',
        isSelected
          ? 'border-primary bg-primary/5'
          : 'border-border hover:border-primary/50 hover:bg-muted/50'
      )}
      title={t(size.nameKey)}
    >
      <span className={cn('font-medium', size.className)}>Aa</span>
      <span className="text-[10px] text-muted-foreground">{size.preview}</span>
    </button>
  );
}

function FontButton({
  font,
  isSelected,
  onClick,
}: {
  font: NotepadFont;
  isSelected: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center justify-between px-3 py-2.5 rounded-lg border transition-all duration-200',
        isSelected
          ? 'border-primary bg-primary/5'
          : 'border-border hover:border-primary/50 hover:bg-muted/50'
      )}
    >
      <span className={cn('text-sm', font.className)}>{font.name}</span>
      <span className="text-xs text-muted-foreground">{t(font.previewKey)}</span>
    </button>
  );
}
