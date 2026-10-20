import { SYSTEM_FONT_OPTION_VALUE, type LocalFontOption } from '../../../contracts/app_config';

const MONOSPACE_STACK = "ui-monospace, 'Cascadia Mono', Consolas, monospace";

export function buildCodeFontFamilyValue(fontFamily: string): string {
  if (fontFamily === SYSTEM_FONT_OPTION_VALUE) return MONOSPACE_STACK;
  if (/[\\";{}\r\n]/.test(fontFamily)) return MONOSPACE_STACK;
  const safeFamily = fontFamily.trim().slice(0, 200);
  return safeFamily ? `"${safeFamily}", ${MONOSPACE_STACK}` : MONOSPACE_STACK;
}

export function filterFontOptions(options: LocalFontOption[], query: string): LocalFontOption[] {
  const term = query.trim().toLocaleLowerCase();
  return term
    ? options.filter((option) => option.label.toLocaleLowerCase().includes(term))
    : options;
}
