/** 压缩质量等级 */
export type CompressQuality = 'high' | 'medium' | 'low';

/** 图片压缩选项 */
export interface CompressImageOptions {
  /** 裁剪区域（基于原图像素坐标） */
  crop?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /** 输出最大尺寸（最长边） */
  maxSize?: number;
  /** 压缩质量 */
  quality: CompressQuality;
  /** 输出格式 */
  format?: 'jpeg' | 'png';
}

/** 视频压缩选项 */
export interface CompressVideoOptions {
  /** 裁剪区域（基于原始视频像素坐标） */
  crop?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /** 输出最大尺寸（最长边） */
  maxSize?: number;
  /** 压缩质量 */
  quality: CompressQuality;
}

/** FFmpeg 检查结果 */
export interface FfmpegCheckResult {
  available: boolean;
  version?: string;
  /** 检测到的 GPU 编码器名称（如 "NVIDIA NVENC"），未检测到则为 undefined */
  gpuEncoder?: string;
  error?: string;
}

export interface MediaApi {
  /** 使用 FFmpeg 压缩图片，输入 data URL，返回压缩后 data URL */
  compressImage: (dataUrl: string, options: CompressImageOptions) => Promise<string>;
  /** 使用 FFmpeg 压缩视频，输入文件路径，返回处理后文件路径 */
  compressVideo: (filePath: string, options: CompressVideoOptions) => Promise<string>;
  /** 检查 FFmpeg 是否可用 */
  checkFfmpeg: () => Promise<FfmpegCheckResult>;
}

declare global {
  interface Window {
    mediaApi: MediaApi;
  }
}
