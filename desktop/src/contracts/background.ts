export type BackgroundTheme = 'light' | 'dark';
export type BackgroundType = 'color' | 'image' | 'video';

export type BackgroundBaseStyleConfig = {
  backgroundSize?: string;
  backgroundPosition?: string;
  backgroundRepeat?: string;
  opacity?: number;
  blur?: number;
  fitMode?: 'crop' | 'style';
  textColor?: string;
};

export type BackgroundValueConfig = {
  type: BackgroundType;
  color: string;
  image: string;
  video: string;
  backgroundStyle: BackgroundBaseStyleConfig;
};

export type BackgroundStyleConfig = BackgroundBaseStyleConfig & {
  themeVariants?: Partial<Record<BackgroundTheme, BackgroundValueConfig>>;
};

export type BackgroundConfirmPayload = {
  type: BackgroundType;
  color?: string;
  image?: string;
  video?: string;
  backgroundStyle?: BackgroundStyleConfig;
};

export type BackgroundSourceInput = {
  type?: BackgroundType;
  color?: string;
  image?: string;
  video?: string;
  backgroundStyle?: BackgroundStyleConfig;
};

function clonePlain<T>(value: T): T {
  // 使用 structuredClone 替代 JSON round-trip，避免大 base64 字符串导致内存峰值
  return structuredClone(value ?? {} as T);
}

export function stripBackgroundThemeVariants(style?: BackgroundStyleConfig): BackgroundBaseStyleConfig {
  if (!style) return {};
  const baseStyle = { ...style };
  delete baseStyle.themeVariants;
  return clonePlain(baseStyle);
}

export function inferBackgroundType(input: BackgroundSourceInput): BackgroundType {
  if (input.type === 'image' || input.type === 'video' || input.type === 'color') {
    return input.type;
  }
  if (input.video) return 'video';
  if (input.image) return 'image';
  return 'color';
}

export function toBackgroundValueConfig(input: BackgroundSourceInput = {}): BackgroundValueConfig {
  const type = inferBackgroundType(input);
  return {
    type,
    color: typeof input.color === 'string' ? input.color : '',
    image: typeof input.image === 'string' ? input.image : '',
    video: typeof input.video === 'string' ? input.video : '',
    backgroundStyle: stripBackgroundThemeVariants(input.backgroundStyle),
  };
}

export function resolveThemeBackground(
  input: BackgroundSourceInput,
  theme: BackgroundTheme,
): BackgroundValueConfig {
  const fallback = toBackgroundValueConfig(input);
  const variant = input.backgroundStyle?.themeVariants?.[theme];
  return variant ? toBackgroundValueConfig(variant) : fallback;
}

export function withThemeBackground(
  current: BackgroundSourceInput,
  theme: BackgroundTheme,
  next: BackgroundSourceInput,
): BackgroundValueConfig & { backgroundStyle: BackgroundStyleConfig } {
  const currentValue = toBackgroundValueConfig(current);
  const nextValue = toBackgroundValueConfig(next);
  const existingVariants = current.backgroundStyle?.themeVariants ?? {};
  const themeVariants: Record<BackgroundTheme, BackgroundValueConfig> = {
    light: toBackgroundValueConfig(existingVariants.light ?? currentValue),
    dark: toBackgroundValueConfig(existingVariants.dark ?? currentValue),
  };

  themeVariants[theme] = nextValue;

  return {
    ...nextValue,
    backgroundStyle: {
      ...nextValue.backgroundStyle,
      themeVariants,
    },
  };
}
