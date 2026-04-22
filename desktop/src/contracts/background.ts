export type BackgroundStyleConfig = {
  backgroundSize?: string;
  backgroundPosition?: string;
  backgroundRepeat?: string;
  opacity?: number;
};

export type BackgroundConfirmPayload = {
  type: 'color' | 'image' | 'video';
  color?: string;
  image?: string;
  video?: string;
  backgroundStyle?: BackgroundStyleConfig;
};
