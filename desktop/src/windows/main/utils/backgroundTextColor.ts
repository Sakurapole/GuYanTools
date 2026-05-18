type TextColorAliasMap = {
  primary?: string[];
  secondary?: string[];
  muted?: string[];
  subtle?: string[];
};

type TextColorOptions = {
  aliases?: TextColorAliasMap;
};

const DEFAULT_TEXT_COLOR = '#ffffff';

function colorMix(color: string, percent: number) {
  return `color-mix(in srgb, ${color} ${percent}%, transparent)`;
}

export function buildBackgroundTextVars(textColor?: string, options: TextColorOptions = {}) {
  const color = textColor?.trim();
  if (!color) {
    return {};
  }

  const primary = color;
  const secondary = colorMix(color, 74);
  const muted = colorMix(color, 58);
  const subtle = colorMix(color, 44);
  const vars: Record<string, string> = {
    '--background-text-primary': primary,
    '--background-text-secondary': secondary,
    '--background-text-muted': muted,
    '--background-text-subtle': subtle,
  };

  const aliases = options.aliases ?? {};
  for (const name of aliases.primary ?? []) vars[name] = primary;
  for (const name of aliases.secondary ?? []) vars[name] = secondary;
  for (const name of aliases.muted ?? []) vars[name] = muted;
  for (const name of aliases.subtle ?? []) vars[name] = subtle;

  return vars;
}

export function withDefaultBackgroundTextVars(options: TextColorOptions = {}) {
  return buildBackgroundTextVars(DEFAULT_TEXT_COLOR, options);
}
