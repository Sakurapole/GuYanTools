/**
 * Built-in terminal color schemes (xterm ITheme compatible).
 *
 * Each scheme provides the full 16-color ANSI palette plus
 * background, foreground, cursor and selection colors.
 */
import type { ITheme } from '@xterm/xterm';

export interface TerminalColorScheme {
  /** Unique stable identifier persisted in user config */
  id: string;
  /** Display label shown in the scheme picker (Chinese UI) */
  label: string;
  /** Optional grouping tag */
  group?: 'dark' | 'light';
  /** xterm theme object  */
  theme: ITheme;
  /** CSS background color for the viewport container */
  viewportBg: string;
  /** Whether to show the grid background overlay */
  showGrid: boolean;
}

const TRANSPARENT_TERM_BG = 'rgba(0, 0, 0, 0)';

// ---------------------------------------------------------------------------
// Built-in dark schemes
// ---------------------------------------------------------------------------

const schemeDarkDefault: TerminalColorScheme = {
  id: 'dark-default',
  label: '深空（默认）',
  group: 'dark',
  viewportBg: '#0f1524',
  showGrid: true,
  theme: {
    background: TRANSPARENT_TERM_BG,
    foreground: '#e2e8f0',
    cursor: '#f8fafc',
    selectionBackground: 'rgba(148, 163, 184, 0.32)',
    selectionForeground: '#f8fafc',
    selectionInactiveBackground: 'rgba(148, 163, 184, 0.22)',
    black: '#0f172a',
    red: '#ef4444',
    green: '#22c55e',
    yellow: '#f59e0b',
    blue: '#60a5fa',
    magenta: '#a855f7',
    cyan: '#22d3ee',
    white: '#e5e7eb',
    brightBlack: '#475569',
    brightRed: '#f87171',
    brightGreen: '#4ade80',
    brightYellow: '#fbbf24',
    brightBlue: '#93c5fd',
    brightMagenta: '#c084fc',
    brightCyan: '#67e8f9',
    brightWhite: '#f8fafc',
  },
};

const schemeDracula: TerminalColorScheme = {
  id: 'dracula',
  label: 'Dracula',
  group: 'dark',
  viewportBg: '#282a36',
  showGrid: false,
  theme: {
    background: TRANSPARENT_TERM_BG,
    foreground: '#f8f8f2',
    cursor: '#f8f8f2',
    selectionBackground: 'rgba(68, 71, 90, 0.60)',
    selectionForeground: '#f8f8f2',
    selectionInactiveBackground: 'rgba(68, 71, 90, 0.42)',
    black: '#21222c',
    red: '#ff5555',
    green: '#50fa7b',
    yellow: '#f1fa8c',
    blue: '#bd93f9',
    magenta: '#ff79c6',
    cyan: '#8be9fd',
    white: '#f8f8f2',
    brightBlack: '#6272a4',
    brightRed: '#ff6e6e',
    brightGreen: '#69ff94',
    brightYellow: '#ffffa5',
    brightBlue: '#d6acff',
    brightMagenta: '#ff92df',
    brightCyan: '#a4ffff',
    brightWhite: '#ffffff',
  },
};

const schemeMonokai: TerminalColorScheme = {
  id: 'monokai',
  label: 'Monokai Pro',
  group: 'dark',
  viewportBg: '#2d2a2e',
  showGrid: false,
  theme: {
    background: TRANSPARENT_TERM_BG,
    foreground: '#fcfcfa',
    cursor: '#fcfcfa',
    selectionBackground: 'rgba(117, 113, 94, 0.40)',
    selectionForeground: '#fcfcfa',
    selectionInactiveBackground: 'rgba(117, 113, 94, 0.28)',
    black: '#403e41',
    red: '#ff6188',
    green: '#a9dc76',
    yellow: '#ffd866',
    blue: '#78dce8',
    magenta: '#ab9df2',
    cyan: '#78dce8',
    white: '#fcfcfa',
    brightBlack: '#727072',
    brightRed: '#ff6188',
    brightGreen: '#a9dc76',
    brightYellow: '#ffd866',
    brightBlue: '#78dce8',
    brightMagenta: '#ab9df2',
    brightCyan: '#78dce8',
    brightWhite: '#fcfcfa',
  },
};

const schemeNord: TerminalColorScheme = {
  id: 'nord',
  label: 'Nord',
  group: 'dark',
  viewportBg: '#2e3440',
  showGrid: false,
  theme: {
    background: TRANSPARENT_TERM_BG,
    foreground: '#d8dee9',
    cursor: '#d8dee9',
    selectionBackground: 'rgba(136, 192, 208, 0.25)',
    selectionForeground: '#eceff4',
    selectionInactiveBackground: 'rgba(136, 192, 208, 0.18)',
    black: '#3b4252',
    red: '#bf616a',
    green: '#a3be8c',
    yellow: '#ebcb8b',
    blue: '#81a1c1',
    magenta: '#b48ead',
    cyan: '#88c0d0',
    white: '#e5e9f0',
    brightBlack: '#4c566a',
    brightRed: '#bf616a',
    brightGreen: '#a3be8c',
    brightYellow: '#ebcb8b',
    brightBlue: '#81a1c1',
    brightMagenta: '#b48ead',
    brightCyan: '#8fbcbb',
    brightWhite: '#eceff4',
  },
};

const schemeTokyoNight: TerminalColorScheme = {
  id: 'tokyo-night',
  label: 'Tokyo Night',
  group: 'dark',
  viewportBg: '#1a1b26',
  showGrid: false,
  theme: {
    background: TRANSPARENT_TERM_BG,
    foreground: '#a9b1d6',
    cursor: '#c0caf5',
    selectionBackground: 'rgba(51, 59, 91, 0.50)',
    selectionForeground: '#c0caf5',
    selectionInactiveBackground: 'rgba(51, 59, 91, 0.34)',
    black: '#15161e',
    red: '#f7768e',
    green: '#9ece6a',
    yellow: '#e0af68',
    blue: '#7aa2f7',
    magenta: '#bb9af7',
    cyan: '#7dcfff',
    white: '#a9b1d6',
    brightBlack: '#414868',
    brightRed: '#f7768e',
    brightGreen: '#9ece6a',
    brightYellow: '#e0af68',
    brightBlue: '#7aa2f7',
    brightMagenta: '#bb9af7',
    brightCyan: '#7dcfff',
    brightWhite: '#c0caf5',
  },
};

const schemeCatppuccinMocha: TerminalColorScheme = {
  id: 'catppuccin-mocha',
  label: 'Catppuccin Mocha',
  group: 'dark',
  viewportBg: '#1e1e2e',
  showGrid: false,
  theme: {
    background: TRANSPARENT_TERM_BG,
    foreground: '#cdd6f4',
    cursor: '#f5e0dc',
    selectionBackground: 'rgba(88, 91, 112, 0.40)',
    selectionForeground: '#f5e0dc',
    selectionInactiveBackground: 'rgba(88, 91, 112, 0.28)',
    black: '#45475a',
    red: '#f38ba8',
    green: '#a6e3a1',
    yellow: '#f9e2af',
    blue: '#89b4fa',
    magenta: '#f5c2e7',
    cyan: '#94e2d5',
    white: '#bac2de',
    brightBlack: '#585b70',
    brightRed: '#f38ba8',
    brightGreen: '#a6e3a1',
    brightYellow: '#f9e2af',
    brightBlue: '#89b4fa',
    brightMagenta: '#f5c2e7',
    brightCyan: '#94e2d5',
    brightWhite: '#a6adc8',
  },
};

const schemeOneDarkPro: TerminalColorScheme = {
  id: 'one-dark-pro',
  label: 'One Dark Pro',
  group: 'dark',
  viewportBg: '#282c34',
  showGrid: false,
  theme: {
    background: TRANSPARENT_TERM_BG,
    foreground: '#abb2bf',
    cursor: '#528bff',
    selectionBackground: 'rgba(62, 68, 81, 0.50)',
    selectionForeground: '#ffffff',
    selectionInactiveBackground: 'rgba(62, 68, 81, 0.34)',
    black: '#282c34',
    red: '#e06c75',
    green: '#98c379',
    yellow: '#e5c07b',
    blue: '#61afef',
    magenta: '#c678dd',
    cyan: '#56b6c2',
    white: '#abb2bf',
    brightBlack: '#5c6370',
    brightRed: '#e06c75',
    brightGreen: '#98c379',
    brightYellow: '#e5c07b',
    brightBlue: '#61afef',
    brightMagenta: '#c678dd',
    brightCyan: '#56b6c2',
    brightWhite: '#ffffff',
  },
};

// ---------------------------------------------------------------------------
// Built-in light schemes
// ---------------------------------------------------------------------------

const schemeLightDefault: TerminalColorScheme = {
  id: 'light-default',
  label: '晨曦',
  group: 'light',
  viewportBg: '#fafbfc',
  showGrid: true,
  theme: {
    background: TRANSPARENT_TERM_BG,
    foreground: '#24292e',
    cursor: '#24292e',
    selectionBackground: 'rgba(3, 102, 214, 0.20)',
    selectionForeground: '#0f172a',
    selectionInactiveBackground: 'rgba(3, 102, 214, 0.14)',
    black: '#24292e',
    red: '#d73a49',
    green: '#22863a',
    yellow: '#b08800',
    blue: '#0366d6',
    magenta: '#6f42c1',
    cyan: '#1b7c83',
    white: '#6a737d',
    brightBlack: '#959da5',
    brightRed: '#cb2431',
    brightGreen: '#28a745',
    brightYellow: '#dbab09',
    brightBlue: '#2188ff',
    brightMagenta: '#8a63d2',
    brightCyan: '#3192aa',
    brightWhite: '#fafbfc',
  },
};

const schemeSolarizedLight: TerminalColorScheme = {
  id: 'solarized-light',
  label: 'Solarized Light',
  group: 'light',
  viewportBg: '#fdf6e3',
  showGrid: false,
  theme: {
    background: TRANSPARENT_TERM_BG,
    foreground: '#657b83',
    cursor: '#586e75',
    selectionBackground: 'rgba(7, 54, 66, 0.12)',
    selectionForeground: '#073642',
    selectionInactiveBackground: 'rgba(7, 54, 66, 0.08)',
    black: '#073642',
    red: '#dc322f',
    green: '#859900',
    yellow: '#b58900',
    blue: '#268bd2',
    magenta: '#d33682',
    cyan: '#2aa198',
    white: '#eee8d5',
    brightBlack: '#002b36',
    brightRed: '#cb4b16',
    brightGreen: '#586e75',
    brightYellow: '#657b83',
    brightBlue: '#839496',
    brightMagenta: '#6c71c4',
    brightCyan: '#93a1a1',
    brightWhite: '#fdf6e3',
  },
};

const schemeGitHubLight: TerminalColorScheme = {
  id: 'github-light',
  label: 'GitHub Light',
  group: 'light',
  viewportBg: '#ffffff',
  showGrid: false,
  theme: {
    background: TRANSPARENT_TERM_BG,
    foreground: '#1f2328',
    cursor: '#1f2328',
    selectionBackground: 'rgba(84, 174, 255, 0.20)',
    selectionForeground: '#0d1117',
    selectionInactiveBackground: 'rgba(84, 174, 255, 0.14)',
    black: '#24292f',
    red: '#cf222e',
    green: '#116329',
    yellow: '#4d2d00',
    blue: '#0550ae',
    magenta: '#8250df',
    cyan: '#1b7c83',
    white: '#6e7781',
    brightBlack: '#57606a',
    brightRed: '#a40e26',
    brightGreen: '#1a7f37',
    brightYellow: '#633c01',
    brightBlue: '#0969da',
    brightMagenta: '#8250df',
    brightCyan: '#3192aa',
    brightWhite: '#ffffff',
  },
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const BUILTIN_SCHEMES: TerminalColorScheme[] = [
  schemeDarkDefault,
  schemeDracula,
  schemeMonokai,
  schemeNord,
  schemeTokyoNight,
  schemeCatppuccinMocha,
  schemeOneDarkPro,
  schemeLightDefault,
  schemeSolarizedLight,
  schemeGitHubLight,
];

export const DEFAULT_SCHEME_ID = 'dark-default';

/**
 * Resolve a scheme by id; returns the default dark scheme when
 * the given id is unknown or empty.
 */
export function resolveScheme(schemeId?: string): TerminalColorScheme {
  if (!schemeId) return schemeDarkDefault;
  return BUILTIN_SCHEMES.find((s) => s.id === schemeId) ?? schemeDarkDefault;
}
