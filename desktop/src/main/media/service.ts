import { execFile } from 'child_process';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { appConfigManager } from '../app-config/manager';
import type { CompressQuality, CompressImageOptions, CompressVideoOptions, FfmpegCheckResult } from '@/contracts/media';

// ─── 质量映射 ───

/** 图片 -q:v (1=最好, 31=最差) */
const IMAGE_QUALITY_MAP: Record<CompressQuality, number> = {
  high: 2,
  medium: 8,
  low: 15,
};

/** 视频 x264 -crf (0=无损, 51=最差) */
const VIDEO_CRF_MAP: Record<CompressQuality, number> = {
  high: 18,
  medium: 28,
  low: 35,
};

// ─── GPU 编码器 ───

interface HwEncoder {
  /** FFmpeg 编码器名称，如 h264_nvenc */
  name: string;
  /** 用户可读名称 */
  label: string;
}

/** 按优先级排列的 GPU 编码器候选 */
const HW_ENCODER_CANDIDATES: HwEncoder[] = [
  { name: 'h264_nvenc', label: 'NVIDIA NVENC' },
  { name: 'h264_qsv',  label: 'Intel QuickSync' },
  { name: 'h264_amf',  label: 'AMD AMF' },
];

/** 缓存检测结果：undefined=未检测，null=无 GPU，HwEncoder=已检测到 */
let cachedHwEncoder: HwEncoder | null | undefined = undefined;

/**
 * 探测当前 FFmpeg 可用的 GPU 编码器。
 * 结果会被缓存，后续调用直接返回缓存。
 */
async function detectHwEncoder(ffmpegPath: string): Promise<HwEncoder | null> {
  if (cachedHwEncoder !== undefined) return cachedHwEncoder;

  try {
    const output = await runFfmpeg(ffmpegPath, ['-hide_banner', '-encoders']);
    for (const candidate of HW_ENCODER_CANDIDATES) {
      // '-encoders' 输出格式: " V..... h264_nvenc   NVIDIA NVENC H.264 encoder ..."
      if (output.includes(candidate.name)) {
        cachedHwEncoder = candidate;
        console.log(`[media] GPU 编码器已检测: ${candidate.label} (${candidate.name})`);
        return candidate;
      }
    }
  } catch {
    // 探测失败，回退 CPU
  }

  cachedHwEncoder = null;
  console.log('[media] 无可用 GPU 编码器，将使用 CPU (libx264)');
  return null;
}

/**
 * 为指定编码器和质量等级生成编码参数。
 * GPU 不可用或 encoder 为 null 时，返回 CPU (libx264) 参数。
 */
function buildVideoEncoderArgs(encoder: HwEncoder | null, quality: CompressQuality): string[] {
  if (!encoder) {
    // ─── CPU: libx264 ───
    const crf = VIDEO_CRF_MAP[quality] ?? VIDEO_CRF_MAP.high;
    const preset = quality === 'low' ? 'fast' : quality === 'medium' ? 'medium' : 'slow';
    return ['-c:v', 'libx264', '-crf', String(crf), '-preset', preset];
  }

  // 各 GPU 编码器的质量/恒定量化参数 (0=无损, 51=最差，与 CRF 类似)
  const gpuQuality: Record<CompressQuality, number> = { high: 20, medium: 28, low: 35 };
  const qVal = gpuQuality[quality] ?? gpuQuality.high;

  switch (encoder.name) {
    case 'h264_nvenc': {
      // NVENC: -rc vbr -cq <val> -b:v 0 让码率完全由 cq 控制
      const preset = quality === 'low' ? 'fast' : quality === 'medium' ? 'medium' : 'slow';
      return [
        '-c:v', 'h264_nvenc',
        '-preset', preset,
        '-rc', 'vbr',
        '-cq', String(qVal),
        '-b:v', '0',
      ];
    }

    case 'h264_qsv': {
      const preset = quality === 'low' ? 'veryfast' : quality === 'medium' ? 'medium' : 'veryslow';
      return [
        '-c:v', 'h264_qsv',
        '-preset', preset,
        '-global_quality', String(qVal),
      ];
    }

    case 'h264_amf': {
      const qualityStr = quality === 'low' ? 'speed' : quality === 'medium' ? 'balanced' : 'quality';
      return [
        '-c:v', 'h264_amf',
        '-quality', qualityStr,
        '-rc', 'cqp',
        '-qp_i', String(qVal),
        '-qp_p', String(qVal),
      ];
    }

    default: {
      // 未知编码器，回退 CPU
      const crf = VIDEO_CRF_MAP[quality] ?? VIDEO_CRF_MAP.high;
      return ['-c:v', 'libx264', '-crf', String(crf), '-preset', 'slow'];
    }
  }
}

// ─── 工具函数 ───

function getFfmpegPath(): string {
  const config = appConfigManager.getCachedConfig();
  return config.tools.ffmpegPath || '';
}

function tmpFile(ext: string): string {
  const name = `guyantools-media-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
  return path.join(os.tmpdir(), name);
}

function runFfmpeg(ffmpegPath: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(ffmpegPath, args, { timeout: 120_000 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`FFmpeg error: ${stderr || error.message}`));
      } else {
        resolve(stdout);
      }
    });
  });
}

// ─── 公共方法 ───

export async function checkFfmpeg(): Promise<FfmpegCheckResult> {
  const ffmpegPath = getFfmpegPath();
  if (!ffmpegPath) {
    return { available: false, error: '未配置 FFmpeg 路径' };
  }

  try {
    const output = await new Promise<string>((resolve, reject) => {
      execFile(ffmpegPath, ['-version'], { timeout: 5000 }, (error, stdout) => {
        if (error) reject(error);
        else resolve(stdout);
      });
    });

    const match = output.match(/ffmpeg version (\S+)/);
    const version = match?.[1] || 'unknown';

    // 同时探测 GPU 编码器
    const hwEncoder = await detectHwEncoder(ffmpegPath);
    return {
      available: true,
      version,
      gpuEncoder: hwEncoder?.label,
    };
  } catch (error: any) {
    return { available: false, error: error.message || '无法执行 FFmpeg' };
  }
}

export async function compressImage(dataUrl: string, options: CompressImageOptions): Promise<string> {
  const ffmpegPath = getFfmpegPath();
  if (!ffmpegPath) throw new Error('未配置 FFmpeg 路径');

  const format = options.format || 'jpeg';
  const inputExt = '.png'; // data URL 解码为 PNG 输入
  const outputExt = format === 'png' ? '.png' : '.jpg';

  // 1. 将 data URL 写入临时文件
  const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '');
  const inputPath = tmpFile(inputExt);
  const outputPath = tmpFile(outputExt);

  try {
    await fs.writeFile(inputPath, Buffer.from(base64Data, 'base64'));

    // 2. 构建 FFmpeg 参数
    const args = ['-y', '-i', inputPath];

    // 视频滤镜
    const filters: string[] = [];

    if (options.crop) {
      const { width, height, x, y } = options.crop;
      filters.push(`crop=${width}:${height}:${x}:${y}`);
    }

    if (options.maxSize) {
      filters.push(`scale='if(gt(iw,ih),min(${options.maxSize},iw),-2)':'if(gt(ih,iw),min(${options.maxSize},ih),-2)'`);
    }

    if (filters.length > 0) {
      args.push('-vf', filters.join(','));
    }

    // 质量
    const qv = IMAGE_QUALITY_MAP[options.quality] ?? IMAGE_QUALITY_MAP.high;
    if (format === 'jpeg') {
      args.push('-q:v', String(qv));
    }

    args.push(outputPath);

    // 3. 执行
    await runFfmpeg(ffmpegPath, args);

    // 4. 读取输出文件并转为 data URL
    const outputBuffer = await fs.readFile(outputPath);
    const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
    return `data:${mimeType};base64,${outputBuffer.toString('base64')}`;
  } finally {
    // 清理临时文件
    await fs.remove(inputPath).catch(() => {});
    await fs.remove(outputPath).catch(() => {});
  }
}

/**
 * 执行视频编码（内部函数，支持 GPU / CPU）。
 * 独立抽出以便 GPU 失败时自动回退 CPU 重试。
 */
async function runVideoEncode(
  ffmpegPath: string,
  filePath: string,
  outputPath: string,
  options: CompressVideoOptions,
  encoder: HwEncoder | null,
): Promise<void> {
  const args = ['-y'];

  // GPU 解码加速（仅在使用 GPU 编码器时启用）
  if (encoder) {
    args.push('-hwaccel', 'auto');
  }

  args.push('-i', filePath);

  // ─── 滤镜 ───
  const filters: string[] = [];

  if (options.crop) {
    const { width, height, x, y } = options.crop;
    filters.push(`crop=${width}:${height}:${x}:${y}`);
  }

  if (options.maxSize) {
    filters.push(`scale='min(${options.maxSize},iw)':'min(${options.maxSize},ih)':force_original_aspect_ratio=decrease`);
    // 编码器要求宽高均为偶数
    filters.push('pad=ceil(iw/2)*2:ceil(ih/2)*2');
  }

  if (filters.length > 0) {
    args.push('-vf', filters.join(','));
  }

  // ─── 编码参数 ───
  const encoderArgs = buildVideoEncoderArgs(encoder, options.quality);
  args.push(
    ...encoderArgs,
    '-pix_fmt', 'yuv420p',
    '-an',
    '-movflags', '+faststart',
    outputPath,
  );

  await runFfmpeg(ffmpegPath, args);
}

export async function compressVideo(filePath: string, options: CompressVideoOptions): Promise<string> {
  const ffmpegPath = getFfmpegPath();
  if (!ffmpegPath) throw new Error('未配置 FFmpeg 路径');

  const outputPath = tmpFile('.mp4');

  // 自动检测 GPU 编码器
  const hwEncoder = await detectHwEncoder(ffmpegPath);

  if (hwEncoder) {
    try {
      await runVideoEncode(ffmpegPath, filePath, outputPath, options, hwEncoder);
      return outputPath;
    } catch (gpuError) {
      // GPU 编码失败（驱动问题、不支持的像素格式等），自动回退 CPU
      console.warn(`[media] GPU 编码失败，回退 CPU: ${gpuError}`);
      await fs.remove(outputPath).catch(() => {});
    }
  }

  // CPU 回退
  await runVideoEncode(ffmpegPath, filePath, outputPath, options, null);
  return outputPath;
}
