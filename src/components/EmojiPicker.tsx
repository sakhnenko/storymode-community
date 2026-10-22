import { useState } from 'react';
import Picker from '@emoji-mart/react';
import data from '@emoji-mart/data';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';

interface EmojiPickerProps {
  value: string;
  onChange: (emoji: string) => void;
}

export function EmojiPicker({ value, onChange }: EmojiPickerProps) {
  const [open, setOpen] = useState(false);

  const handleSelect = (emoji: any) => {
    onChange(emoji.native);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 text-lg hover:bg-accent"
        >
          {value}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 border-none" align="start">
        <Picker
          data={data}
          onEmojiSelect={handleSelect}
          theme="light"
          previewPosition="none"
          skinTonePosition="search"
        />
      </PopoverContent>
    </Popover>
  );
}