import { useState, useRef } from 'react';
import { Upload, SpinnerGap, X } from '@/components/ui/icons';
import { Markdown } from '@/components/Markdown';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getThemeById, getFontById, getFontSizeById } from '@/lib/notepad-themes';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import { notifyCreditsChanged } from '@/hooks/useUserCredits';

interface ScanDocumentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  notepadTheme: string;
  notepadFont: string;
  notepadFontSize: string;
  onReplace: (text: string) => void;
  onAddToBeginning: (text: string) => void;
  onAddToEnd: (text: string) => void;
  onAddToNewNotebook: (text: string) => void;
}

export function ScanDocumentModal({ open, onOpenChange, notepadTheme, notepadFont, notepadFontSize, onReplace, onAddToBeginning, onAddToEnd, onAddToNewNotebook }: ScanDocumentModalProps) {
  const { t } = useTranslation();
  const [isScanning, setIsScanning] = useState(false);
  const [extractedText, setExtractedText] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const theme = getThemeById(notepadTheme);
  const font = getFontById(notepadFont);
  const fontSize = getFontSizeById(notepadFontSize);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({ title: t('notepad.scan.invalidFileType'), description: t('notepad.scan.invalidFileTypeDesc'), variant: 'destructive' });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: t('notepad.scan.fileTooLarge'), description: t('notepad.scan.fileTooLargeDesc'), variant: 'destructive' });
      return;
    }
    setIsScanning(true);
    setExtractedText(null);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      setPreviewImage(base64);
      const { data, error } = await supabase.functions.invoke('ocr-scan', { body: { imageBase64: base64 } });
      const serverMessage = (data as any)?.error as string | undefined;
      if (serverMessage) throw new Error(serverMessage);
      if (error) throw new Error(error.message || t('notepad.scan.networkError'));
      if (!data?.text) throw new Error(t('notepad.scan.noText'));
      setExtractedText(data.text);
      toast({ title: t('notepad.scan.complete'), description: t('notepad.scan.completeDesc') });
    } catch (error) {
      console.error('Scan error:', error);
      toast({ title: t('notepad.scan.failed'), description: error instanceof Error ? error.message : t('notepad.scan.failedDefault'), variant: 'destructive' });
      setPreviewImage(null);
    } finally {
      setIsScanning(false);
      notifyCreditsChanged();
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleAction = (action: 'replace' | 'beginning' | 'end' | 'new') => {
    if (!extractedText) return;
    switch (action) {
      case 'replace': onReplace(extractedText); break;
      case 'beginning': onAddToBeginning(extractedText); break;
      case 'end': onAddToEnd(extractedText); break;
      case 'new': onAddToNewNotebook(extractedText); break;
    }
    handleClose();
  };

  const handleClose = () => { setExtractedText(null); setPreviewImage(null); setIsScanning(false); onOpenChange(false); };
  const handleReset = () => { setExtractedText(null); setPreviewImage(null); };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{t('notepad.scan.title')}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {t('notepad.scan.subtitle')}
            <span className="mx-1.5 opacity-40">·</span>
            <span className="opacity-80">{t('credits.costScan', { defaultValue: 'A few credits per scan' })}</span>
          </p>
        </DialogHeader>
        <div className="flex-1 overflow-auto">
          {!extractedText && !isScanning && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-full max-w-md border-2 border-dashed border-muted-foreground/30 rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors" onClick={() => fileInputRef.current?.click()}>
                <Upload weight="duotone" className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-lg font-medium mb-2">{t('notepad.scan.uploadTitle')}</p>
                <p className="text-sm text-muted-foreground">{t('notepad.scan.uploadSubtitle')}</p>
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
            </div>
          )}
          {isScanning && (
            <div className="flex flex-col items-center justify-center py-12">
              <SpinnerGap weight="duotone" className="w-12 h-12 animate-spin text-primary mb-4" />
              <p className="text-lg font-medium">{t('notepad.scan.scanning')}</p>
              <p className="text-sm text-muted-foreground">{t('notepad.scan.scanningSubtitle')}</p>
            </div>
          )}
          {extractedText && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{t('notepad.scan.previewLabel')}</p>
                <Button variant="ghost" size="sm" onClick={handleReset} className="text-muted-foreground">
                  <X weight="duotone" className="w-4 h-4 mr-1" />
                  {t('notepad.scan.scanAnother')}
                </Button>
              </div>
              <div className={cn('rounded-lg border-2 overflow-hidden max-h-64 overflow-y-auto', theme.className, font.className, fontSize.className)}
                style={{ backgroundColor: `hsl(var(--notepad-bg))`, color: `hsl(var(--notepad-fg))`, borderColor: `hsl(var(--notepad-border-focus))` }}>
                <div className="p-4 notepad-content prose-sm">
                  <Markdown variant="notebook" content={extractedText} readOnly />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-4">
                <Button onClick={() => handleAction('replace')} variant="default" className="w-full">{t('notepad.scan.replaceText')}</Button>
                <Button onClick={() => handleAction('beginning')} variant="secondary" className="w-full">{t('notepad.scan.addToBeginning')}</Button>
                <Button onClick={() => handleAction('end')} variant="secondary" className="w-full">{t('notepad.scan.addToEnd')}</Button>
                <Button onClick={() => handleAction('new')} variant="outline" className="w-full">{t('notepad.scan.addToNewNotebook')}</Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
