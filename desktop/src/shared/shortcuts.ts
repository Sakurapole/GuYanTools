const MODIFIER_ORDER = ['CommandOrControl', 'Shift', 'Alt', 'Super'] as const;

const MODIFIER_ALIASES: Record<string, typeof MODIFIER_ORDER[number]> = {
  cmdorctrl: 'CommandOrControl',
  commandorcontrol: 'CommandOrControl',
  ctrl: 'CommandOrControl',
  control: 'CommandOrControl',
  cmd: 'CommandOrControl',
  command: 'CommandOrControl',
  meta: 'Super',
  super: 'Super',
  win: 'Super',
  windows: 'Super',
  option: 'Alt',
  alt: 'Alt',
  shift: 'Shift',
};

const KEY_ALIASES: Record<string, string> = {
  esc: 'Escape',
  escape: 'Escape',
  return: 'Enter',
  enter: 'Enter',
  space: 'Space',
  ' ': 'Space',
  tab: 'Tab',
  backspace: 'Backspace',
  delete: 'Delete',
  del: 'Delete',
  insert: 'Insert',
  ins: 'Insert',
  home: 'Home',
  end: 'End',
  pageup: 'PageUp',
  pagedown: 'PageDown',
  up: 'Up',
  arrowup: 'Up',
  down: 'Down',
  arrowdown: 'Down',
  left: 'Left',
  arrowleft: 'Left',
  right: 'Right',
  arrowright: 'Right',
  plus: '+',
};

function normalizeMainKeyToken(token: string): string {
  const trimmed = token.trim();
  if (!trimmed) {
    return '';
  }

  const alias = KEY_ALIASES[trimmed.toLowerCase()];
  if (alias) {
    return alias;
  }

  if (/^f\d{1,2}$/i.test(trimmed)) {
    return trimmed.toUpperCase();
  }

  if (/^[a-z]$/i.test(trimmed)) {
    return trimmed.toUpperCase();
  }

  if (/^\d$/.test(trimmed)) {
    return trimmed;
  }

  return trimmed.length === 1
    ? trimmed.toUpperCase()
    : `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1).toLowerCase()}`;
}

function normalizeModifierToken(token: string): typeof MODIFIER_ORDER[number] | '' {
  return MODIFIER_ALIASES[token.trim().toLowerCase()] ?? '';
}

export function normalizeAccelerator(accelerator: string): string {
  if (typeof accelerator !== 'string') {
    return '';
  }

  const modifiers = new Set<typeof MODIFIER_ORDER[number]>();
  let mainKey = '';

  for (const token of accelerator.split('+')) {
    const trimmed = token.trim();
    if (!trimmed) {
      continue;
    }

    const modifier = normalizeModifierToken(trimmed);
    if (modifier) {
      modifiers.add(modifier);
      continue;
    }

    if (!mainKey) {
      mainKey = normalizeMainKeyToken(trimmed);
    }
  }

  if (!mainKey) {
    return '';
  }

  const orderedModifiers = MODIFIER_ORDER.filter((item) => modifiers.has(item));
  return [...orderedModifiers, mainKey].join('+');
}

function isModifierOnlyKey(key: string): boolean {
  return ['Shift', 'Control', 'Alt', 'Meta'].includes(key);
}

function resolveEventMainKey(event: KeyboardEvent): string {
  if (event.code.startsWith('Key') && event.code.length === 4) {
    return event.code.slice(3).toUpperCase();
  }

  if (event.code.startsWith('Digit') && event.code.length === 6) {
    return event.code.slice(5);
  }

  if (/^F\d{1,2}$/i.test(event.key)) {
    return event.key.toUpperCase();
  }

  return normalizeMainKeyToken(event.key);
}

export function acceleratorFromKeyboardEvent(event: KeyboardEvent): string {
  if (isModifierOnlyKey(event.key)) {
    return '';
  }

  const tokens: string[] = [];

  if (event.ctrlKey || event.metaKey) {
    tokens.push('CommandOrControl');
  }

  if (event.shiftKey) {
    tokens.push('Shift');
  }

  if (event.altKey) {
    tokens.push('Alt');
  }

  const mainKey = resolveEventMainKey(event);
  if (!mainKey) {
    return '';
  }

  return normalizeAccelerator([...tokens, mainKey].join('+'));
}

export function eventMatchesAccelerator(event: KeyboardEvent, accelerator: string): boolean {
  const normalizedAccelerator = normalizeAccelerator(accelerator);
  if (!normalizedAccelerator) {
    return false;
  }

  return acceleratorFromKeyboardEvent(event) === normalizedAccelerator;
}

export function humanizeAccelerator(accelerator: string, isMac = false): string {
  const normalized = normalizeAccelerator(accelerator);
  if (!normalized) {
    return '';
  }

  return normalized
    .split('+')
    .map((token) => {
      switch (token) {
        case 'CommandOrControl':
          return isMac ? 'Cmd' : 'Ctrl';
        case 'Alt':
          return isMac ? 'Option' : 'Alt';
        case 'Super':
          return isMac ? 'Cmd' : 'Win';
        default:
          return token;
      }
    })
    .join('+');
}
