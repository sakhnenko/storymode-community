import { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Eraser, Palette, Hash, Eyedropper } from '@/components/ui/icons';

/* ── Canvas-based color gradient picker ── */
function drawGradient(canvas: HTMLCanvasElement, hue: number) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width, h = canvas.height;
  // Horizontal: saturation 0→100%
  // Vertical: lightness 100%→0%
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = x / w; // saturation 0-1
      const l = 1 - y / h; // lightness 1-0
      const [r, g, b] = hslToRgb(hue / 360, s, l);
      const idx = (y * w + x) * 4;
      img.data[idx] = r;
      img.data[idx + 1] = g;
      img.data[idx + 2] = b;
      img.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  let r: number, g: number, b: number;
  if (s === 0) { r = g = b = l; }
  else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [Math.round(h * 360), s, l];
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.substring(0, 2), 16), parseInt(h.substring(2, 4), 16), parseInt(h.substring(4, 6), 16)];
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

/** Darken a hex color by a given ratio (0–1) */
function darkenHex(hex: string, ratio = 0.3): string {
  const clean = hex.replace('#', '');
  const r = Math.max(0, parseInt(clean.slice(0, 2), 16) * (1 - ratio));
  const g = Math.max(0, parseInt(clean.slice(2, 4), 16) * (1 - ratio));
  const b = Math.max(0, parseInt(clean.slice(4, 6), 16) * (1 - ratio));
  return '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
}

const DEFAULT_EMPTY_COLOR = '#e5e7eb';

// 7 primary hue families with muted + vibrant shade rows (6 each)
const COLOR_FAMILIES: { name: string; representative: string; muted: string[]; vibrant: string[] }[] = [
  {
    name: 'Red',
    representative: '#b87272',
    muted:    ['#f2e4e4', '#d9b8b8', '#bf8888', '#9e5e5e', '#7a4040', '#562a2a'],
    vibrant:  ['#fcc', '#f28a8a', '#e05050', '#c02020', '#8b1a1a', '#5c0e0e'],
  },
  {
    name: 'Orange',
    representative: '#b08060',
    muted:    ['#f2e8e0', '#d9c0aa', '#bf9478', '#9a6c50', '#764e38', '#523424'],
    vibrant:  ['#fddcb5', '#f5b06a', '#e08530', '#b86210', '#7e4410', '#4c2808'],
  },
  {
    name: 'Yellow',
    representative: '#c8a83c',
    muted:    ['#faf3d8', '#f0e4a8', '#ddd080', '#c4b458', '#a09038', '#786820'],
    vibrant:  ['#fff4a0', '#ffe54c', '#f5cc00', '#d4a600', '#a07e00', '#6b5400'],
  },
  {
    name: 'Green',
    representative: '#6a9a6a',
    muted:    ['#e4f0e4', '#b0ccb0', '#7ea87e', '#5a885a', '#406440', '#2a442a'],
    vibrant:  ['#b5f0b5', '#6edc6e', '#38b838', '#208a20', '#146214', '#0a3e0a'],
  },
  {
    name: 'Blue',
    representative: '#6080a8',
    muted:    ['#e2e8f0', '#b4c2d6', '#809aba', '#587498', '#3e5274', '#2a3650'],
    vibrant:  ['#b4d4ff', '#6aa8f5', '#3080e0', '#1a5cb8', '#103e80', '#0a2450'],
  },
  {
    name: 'Purple',
    representative: '#8870a8',
    muted:    ['#eae4f0', '#c8bad6', '#a490ba', '#7e6a98', '#5c4c74', '#3c3250'],
    vibrant:  ['#d8b8f8', '#b480f0', '#8c4ce0', '#6830b8', '#481e80', '#2c1050'],
  },
  {
    name: 'Neutral',
    representative: '#8a8480',
    muted:    ['#f0eeec', '#d0ccc8', '#aaa4a0', '#7e7874', '#544e4c', '#2e2c2a'],
    vibrant:  ['#e8e8e8', '#b8b8b8', '#888888', '#606060', '#3c3c3c', '#1a1a1a'],
  },
];

const MAX_RECENT = 12;

interface MapColorPickerProps {
  selectedColor: string;
  onSelectColor: (color: string) => void;
  open: boolean;
  onClose: () => void;
  emptyColor?: string;
  onEyedropper?: () => void;
}

export function MapColorPicker({ selectedColor, onSelectColor, open, onClose, emptyColor, onEyedropper }: MapColorPickerProps) {
  const { t } = useTranslation();
  const EMPTY_COLOR = emptyColor || DEFAULT_EMPTY_COLOR;
  const [activeFamilyIdx, setActiveFamilyIdx] = useState<number | null>(null);
  const [showCustom, setShowCustom] = useState(false);
  const [hexInput, setHexInput] = useState('');
  const [recentColors, setRecentColors] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('map-recent-colors');
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });
  const pickerRef = useRef<HTMLDivElement>(null);
  const gradientCanvasRef = useRef<HTMLCanvasElement>(null);
  const [hue, setHue] = useState(() => {
    if (selectedColor && selectedColor !== EMPTY_COLOR) {
      try { return rgbToHsl(...hexToRgb(selectedColor))[0]; } catch { return 0; }
    }
    return 0;
  });
  const [pickerPos, setPickerPos] = useState<{ x: number; y: number } | null>(() => {
    if (selectedColor && selectedColor !== EMPTY_COLOR) {
      try {
        const [, s, l] = rgbToHsl(...hexToRgb(selectedColor));
        return { x: s, y: 1 - l };
      } catch { return null; }
    }
    return null;
  });

  // Redraw gradient when hue changes or custom view opens
  useEffect(() => {
    if (showCustom && gradientCanvasRef.current) {
      drawGradient(gradientCanvasRef.current, hue);
    }
  }, [hue, showCustom]);

  const addRecent = useCallback((color: string) => {
    if (color === EMPTY_COLOR) return;
    setRecentColors(prev => {
      const next = [color, ...prev.filter(c => c !== color)].slice(0, MAX_RECENT);
      localStorage.setItem('map-recent-colors', JSON.stringify(next));
      return next;
    });
  }, [EMPTY_COLOR]);

  // Auto-track any color the user actually applies (eyedropper, gradient,
  // toolbar swatch, family shade, etc.) — not just clicks inside this picker.
  useEffect(() => {
    if (!selectedColor || selectedColor === EMPTY_COLOR) return;
    if (!/^#[0-9a-fA-F]{6}$/.test(selectedColor)) return;
    addRecent(selectedColor);
  }, [selectedColor, EMPTY_COLOR, addRecent]);

  const pick = useCallback((color: string) => {
    onSelectColor(color);
    addRecent(color);
    onClose();
    setShowCustom(false);
    setActiveFamilyIdx(null);
  }, [onSelectColor, addRecent, onClose]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target?.closest?.('[data-color-trigger]')) return;
      if (pickerRef.current && !pickerRef.current.contains(target)) {
        onClose();
        setShowCustom(false);
        setActiveFamilyIdx(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const activeFamily = activeFamilyIdx !== null ? COLOR_FAMILIES[activeFamilyIdx] : null;

  return (
    <div
      ref={pickerRef}
      className="absolute bottom-full left-0 mb-2 bg-gradient-to-b from-white/95 via-white/90 to-white/85 dark:from-white/15 dark:via-white/10 dark:to-white/5 backdrop-blur-xl border border-white/60 dark:border-white/15 rounded-xl shadow-2xl z-50 select-none"
      style={{ minWidth: 260 }}
    >
      {showCustom ? (
        /* ── Custom Color View ── */
        <div className="p-3 flex flex-col gap-3">
          <div className="flex items-center">
            <button
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setShowCustom(false)}
            >
              ← {t('common.back')}
            </button>
          </div>

          {/* Saturation/Lightness gradient */}
           <div className="relative w-full h-32 rounded-lg overflow-hidden border border-border cursor-crosshair">
            <canvas
              ref={gradientCanvasRef}
              width={260}
              height={128}
              className="w-full h-full"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                const sx = x / rect.width;
                const sy = y / rect.height;
                const s = sx;
                const l = 1 - sy;
                const [r, g, b] = hslToRgb(hue / 360, s, l);
                const hex = rgbToHex(r, g, b);
                onSelectColor(hex);
                setHexInput(hex.replace('#', ''));
                setPickerPos({ x: sx, y: sy });
              }}
            />
            {pickerPos && (
              <div
                className="absolute w-4 h-4 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.3)] pointer-events-none -translate-x-1/2 -translate-y-1/2"
                style={{
                  left: `${pickerPos.x * 100}%`,
                  top: `${pickerPos.y * 100}%`,
                  backgroundColor: selectedColor === EMPTY_COLOR ? '#ffffff' : selectedColor,
                }}
              />
            )}
          </div>

          {/* Hue slider */}
          <input
            type="range"
            min={0}
            max={360}
            value={hue}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              const h = parseInt(e.target.value);
              setHue(h);
              if (pickerPos) {
                const [r, g, b] = hslToRgb(h / 360, pickerPos.x, 1 - pickerPos.y);
                const hex = rgbToHex(r, g, b);
                onSelectColor(hex);
                setHexInput(hex.replace('#', ''));
              }
            }}
            className="w-full h-3 rounded-full appearance-none cursor-pointer"
            style={{
              background: 'linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)',
            }}
          />

          {/* Hex input + preview */}
          <div className="flex items-center gap-1.5">
            <div
              className="w-7 h-7 rounded-full border shrink-0"
              style={{ backgroundColor: selectedColor === EMPTY_COLOR ? '#ffffff' : selectedColor, borderColor: darkenHex(selectedColor === EMPTY_COLOR ? '#ffffff' : selectedColor, 0.35) }}
            />
            <Hash weight="bold" className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <input
              type="text"
              maxLength={6}
              placeholder={t('map.hexColorPlaceholder')}
              value={hexInput}
              onChange={(e) => {
                const val = e.target.value.replace(/[^0-9a-fA-F]/g, '');
                setHexInput(val);
                if (val.length === 6) {
                  const color = '#' + val;
                  onSelectColor(color);
                  try {
                    const [h, s, l] = rgbToHsl(...hexToRgb(color));
                    setHue(h);
                    setPickerPos({ x: s, y: 1 - l });
                  } catch { /* not a colour the picker can place; leave it where it is */ }
                }
              }}
              className="flex-1 text-sm font-mono bg-muted/40 border border-border rounded-md px-2 py-1 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-md hover:bg-primary/20 transition-colors"
              onClick={() => {
                if (hexInput.length >= 3) {
                  const c = '#' + (hexInput.length === 3
                    ? hexInput.split('').map(ch => ch + ch).join('')
                    : hexInput.padEnd(6, '0'));
                  pick(c);
                }
              }}
            >
              Apply
            </button>
          </div>
        </div>
      ) : (
        /* ── Main Picker View ── */
        <div className="p-3 flex flex-col gap-2.5">
          {/* Top row: action buttons + separator + 7 primary hue circles */}
          <div className="flex items-center gap-1.5">
            <button
              className="w-7 h-7 rounded-full border transition-all hover:scale-110 flex items-center justify-center bg-white/60 dark:bg-white/10"
              style={{ borderColor: darkenHex('#9ca3af', 0.2) }}
              onClick={() => {
                setShowCustom(true);
                setHexInput(selectedColor === EMPTY_COLOR ? '' : selectedColor.replace('#', ''));
              }}
              title={t('map.customColor')}
            >
              <Palette weight="bold" className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
            {onEyedropper && (
              <button
                className="w-7 h-7 rounded-full border transition-all hover:scale-110 flex items-center justify-center bg-white/60 dark:bg-white/10"
                style={{ borderColor: darkenHex('#9ca3af', 0.2) }}
                onClick={() => { onEyedropper(); onClose(); }}
                title={t('map.colorPickerTitle')}
              >
                <Eyedropper weight="bold" className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            )}
            <button
              className={`w-7 h-7 rounded-full border transition-all hover:scale-110 flex items-center justify-center ${selectedColor === EMPTY_COLOR ? 'bg-primary/20 border-primary scale-110' : 'bg-white/60 dark:bg-white/10'}`}
              style={selectedColor === EMPTY_COLOR ? {} : { borderColor: darkenHex('#9ca3af', 0.2) }}
              onClick={() => pick(EMPTY_COLOR)}
              title={t('map.eraser')}
            >
              <Eraser weight="bold" className="w-3.5 h-3.5 text-muted-foreground" />
            </button>

            <div className="w-px h-5 bg-border/60" />

            {COLOR_FAMILIES.map((fam, i) => (
              <button
                key={fam.name}
                className={`w-7 h-7 rounded-full border transition-all hover:scale-110 ${activeFamilyIdx === i ? 'border-primary scale-110 ring-2 ring-primary/30' : ''}`}
                style={{ backgroundColor: fam.representative, borderColor: activeFamilyIdx === i ? undefined : darkenHex(fam.representative, 0.35) }}
                onClick={() => setActiveFamilyIdx(activeFamilyIdx === i ? null : i)}
                title={t(`map.color${fam.name}`)}
              />
            ))}
          </div>

          {/* Shade rows: muted + vibrant */}
          {activeFamily && (
            <div className="flex flex-col gap-1">
              <div className="grid grid-cols-6 gap-1">
                {activeFamily.muted.map((shade, i) => (
                  <button
                    key={`m${i}`}
                    className={`w-full aspect-square rounded border transition-all hover:scale-110 ${selectedColor === shade ? 'border-primary ring-1 ring-primary/40 scale-110' : ''}`}
                    style={{ backgroundColor: shade, borderColor: selectedColor === shade ? undefined : darkenHex(shade, 0.35) }}
                    onClick={() => pick(shade)}
                    title={shade}
                  />
                ))}
              </div>
              <div className="grid grid-cols-6 gap-1">
                {activeFamily.vibrant.map((shade, i) => (
                  <button
                    key={`v${i}`}
                    className={`w-full aspect-square rounded border transition-all hover:scale-110 ${selectedColor === shade ? 'border-primary ring-1 ring-primary/40 scale-110' : ''}`}
                    style={{ backgroundColor: shade, borderColor: selectedColor === shade ? undefined : darkenHex(shade, 0.35) }}
                    onClick={() => pick(shade)}
                    title={shade}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Recent colors row */}
          {recentColors.length > 0 && (
            <>
              <div className="w-full h-px bg-border/60" />
              <div className="flex flex-wrap gap-1.5">
                {recentColors.slice(0, 12).map((color, i) => (
                  <button
                    key={`${color}-${i}`}
                    className={`w-5 h-5 rounded-full border transition-all hover:scale-110 ${selectedColor === color ? 'border-primary scale-110' : ''}`}
                    style={{ backgroundColor: color, borderColor: selectedColor === color ? undefined : darkenHex(color, 0.35) }}
                    onClick={() => pick(color)}
                    title={color}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
