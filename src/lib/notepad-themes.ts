export interface NotepadTheme {
  id: string;
  name: string;
  labelKey: string;
  className: string;
  preview: {
    bg: string;
    fg: string;
  };
}

export interface NotepadFont {
  id: string;
  name: string;
  className: string;
  preview: string;
  previewKey: string;
}

export interface NotepadFontSize {
  id: string;
  name: string;
  nameKey: string;
  className: string;
  preview: string;
}

export const NOTEPAD_THEMES: NotepadTheme[] = [
  // Light themes - vibrant, personality-forward folio colors
  {
    id: 'clean-white',
    name: 'Paper',
    labelKey: 'notepad.theme.paper',
    className: 'notepad-theme-clean-white',
    preview: { bg: '#ffffff', fg: '#262a32' },
  },
  {
    id: 'soft-gray',
    name: 'Stone',
    labelKey: 'notepad.theme.stone',
    className: 'notepad-theme-soft-gray',
    preview: { bg: '#eef0f4', fg: '#2b2f36' },
  },
  {
    id: 'cream',
    name: 'Cream',
    labelKey: 'notepad.theme.cream',
    className: 'notepad-theme-cream',
    preview: { bg: '#fdf5dc', fg: '#3d3222' },
  },
  {
    id: 'sepia',
    name: 'Parchment',
    labelKey: 'notepad.theme.parchment',
    className: 'notepad-theme-sepia',
    preview: { bg: '#f5e9d0', fg: '#382f20' },
  },
  {
    id: 'warm-amber',
    name: 'Honey',
    labelKey: 'notepad.theme.honey',
    className: 'notepad-theme-warm-amber',
    preview: { bg: '#f5e8c5', fg: '#3d3222' },
  },
  {
    id: 'soft-blue',
    name: 'Sky',
    labelKey: 'notepad.theme.sky',
    className: 'notepad-theme-soft-blue',
    preview: { bg: '#ddeaf8', fg: '#222e3d' },
  },
  {
    id: 'sage-green',
    name: 'Sage',
    labelKey: 'notepad.theme.sage',
    className: 'notepad-theme-sage-green',
    preview: { bg: '#e2f0e4', fg: '#1f2e22' },
  },
  {
    id: 'lavender',
    name: 'Lavender',
    labelKey: 'notepad.theme.lavender',
    className: 'notepad-theme-lavender',
    preview: { bg: '#ece4fa', fg: '#322d3d' },
  },
  {
    id: 'blush',
    name: 'Rose',
    labelKey: 'notepad.theme.rose',
    className: 'notepad-theme-blush',
    preview: { bg: '#fae6e8', fg: '#3d2d30' },
  },
  {
    id: 'mint',
    name: 'Mint',
    labelKey: 'notepad.theme.mint',
    className: 'notepad-theme-mint',
    preview: { bg: '#e0f5f0', fg: '#1f2e2a' },
  },
  // Dark themes - rich, saturated folio colors
  {
    id: 'midnight',
    name: 'Midnight',
    labelKey: 'notepad.theme.midnight',
    className: 'notepad-theme-midnight',
    preview: { bg: '#0e1521', fg: '#c5ced9' },
  },
  {
    id: 'charcoal',
    name: 'Graphite',
    labelKey: 'notepad.theme.graphite',
    className: 'notepad-theme-charcoal',
    preview: { bg: '#202022', fg: '#cfd0d6' },
  },
  {
    id: 'navy',
    name: 'Ocean',
    labelKey: 'notepad.theme.ocean',
    className: 'notepad-theme-navy',
    preview: { bg: '#0f1c33', fg: '#c7d0db' },
  },
  {
    id: 'forest',
    name: 'Forest',
    labelKey: 'notepad.theme.forest',
    className: 'notepad-theme-forest',
    preview: { bg: '#101f16', fg: '#c5d2c9' },
  },
  {
    id: 'plum',
    name: 'Violet',
    labelKey: 'notepad.theme.violet',
    className: 'notepad-theme-plum',
    preview: { bg: '#1f172a', fg: '#d2c9db' },
  },
  {
    id: 'slate',
    name: 'Steel',
    labelKey: 'notepad.theme.steel',
    className: 'notepad-theme-slate',
    preview: { bg: '#2b3442', fg: '#c7ccd4' },
  },
  {
    id: 'obsidian',
    name: 'Noir',
    labelKey: 'notepad.theme.noir',
    className: 'notepad-theme-obsidian',
    preview: { bg: '#0f0f0f', fg: '#dedede' },
  },
  {
    id: 'mocha',
    name: 'Espresso',
    labelKey: 'notepad.theme.espresso',
    className: 'notepad-theme-mocha',
    preview: { bg: '#291e17', fg: '#d9cfc3' },
  },
];

export const NOTEPAD_FONTS: NotepadFont[] = [
  // Sans-serif — clean, readable workhorses
  {
    id: 'inter',
    name: 'Inter',
    className: 'notepad-font-inter',
    preview: 'Modern Sans',
    previewKey: 'notepad.font.modernSans',
  },
  {
    id: 'source-sans',
    name: 'Source Sans 3',
    className: 'notepad-font-source-sans',
    preview: 'Clean Sans',
    previewKey: 'notepad.font.cleanSans',
  },
  {
    id: 'lato',
    name: 'Lato',
    className: 'notepad-font-lato',
    preview: 'Friendly Sans',
    previewKey: 'notepad.font.friendlySans',
  },
  {
    id: 'atkinson',
    name: 'Atkinson Hyperlegible',
    className: 'notepad-font-atkinson',
    preview: 'Accessible Sans',
    previewKey: 'notepad.font.accessibleSans',
  },
  // Serif — long-form reading favorites
  {
    id: 'serif',
    name: 'Libre Baskerville',
    className: 'notepad-font-serif',
    preview: 'Classic Serif',
    previewKey: 'notepad.font.classicSerif',
  },
  {
    id: 'lora',
    name: 'Lora',
    className: 'notepad-font-lora',
    preview: 'Literary Serif',
    previewKey: 'notepad.font.literarySerif',
  },
  {
    id: 'source',
    name: 'Source Serif',
    className: 'notepad-font-source',
    preview: 'Reading Serif',
    previewKey: 'notepad.font.readingSerif',
  },
  {
    id: 'merriweather',
    name: 'Merriweather',
    className: 'notepad-font-merriweather',
    preview: 'Editorial Serif',
    previewKey: 'notepad.font.editorialSerif',
  },
  {
    id: 'garamond',
    name: 'EB Garamond',
    className: 'notepad-font-garamond',
    preview: 'Classic Garamond',
    previewKey: 'notepad.font.classicGaramond',
  },
  {
    id: 'crimson',
    name: 'Crimson Pro',
    className: 'notepad-font-crimson',
    preview: 'Book Serif',
    previewKey: 'notepad.font.bookSerif',
  },
  {
    id: 'spectral',
    name: 'Spectral',
    className: 'notepad-font-spectral',
    preview: 'Modern Serif',
    previewKey: 'notepad.font.modernSerif',
  },
  {
    id: 'vollkorn',
    name: 'Vollkorn',
    className: 'notepad-font-vollkorn',
    preview: 'Robust Serif',
    previewKey: 'notepad.font.robustSerif',
  },
  // Monospace
  {
    id: 'mono',
    name: 'IBM Plex Mono',
    className: 'notepad-font-mono',
    preview: 'Monospace',
    previewKey: 'notepad.font.monospace',
  },
  {
    id: 'jetbrains',
    name: 'JetBrains Mono',
    className: 'notepad-font-jetbrains',
    preview: 'Code Mono',
    previewKey: 'notepad.font.codeMono',
  },
];

export const NOTEPAD_FONT_SIZES: NotepadFontSize[] = [
  {
    id: 'xs',
    name: 'Extra Small',
    nameKey: 'notepad.fontSize.extraSmall',
    className: 'notepad-size-xs',
    preview: '11px',
  },
  {
    id: 'small',
    name: 'Small',
    nameKey: 'notepad.fontSize.small',
    className: 'notepad-size-small',
    preview: '13px',
  },
  {
    id: 'medium',
    name: 'Medium',
    nameKey: 'notepad.fontSize.medium',
    className: 'notepad-size-medium',
    preview: '15px',
  },
  {
    id: 'large',
    name: 'Large',
    nameKey: 'notepad.fontSize.large',
    className: 'notepad-size-large',
    preview: '17px',
  },
  {
    id: 'xl',
    name: 'Extra Large',
    nameKey: 'notepad.fontSize.extraLarge',
    className: 'notepad-size-xl',
    preview: '20px',
  },
];

export function getThemeById(id: string): NotepadTheme {
  return NOTEPAD_THEMES.find((t) => t.id === id) || NOTEPAD_THEMES[0];
}

export function getFontById(id: string): NotepadFont {
  return NOTEPAD_FONTS.find((f) => f.id === id) || NOTEPAD_FONTS[0];
}

export function getFontSizeById(id: string): NotepadFontSize {
  return NOTEPAD_FONT_SIZES.find((s) => s.id === id) || NOTEPAD_FONT_SIZES[2]; // Default to medium
}
