import { onMounted, ref, watch, type ComputedRef } from 'vue';
import type { FileTransferEntry } from '@/contracts/ftp';
import type { PanelKind } from '../types';
import type { useFtpStore } from '@/windows/main/stores/ftp_store';

const FTP_THUMBNAIL_STORAGE_KEY = 'guyantools.ftp.thumbnail-preferences';
const DEFAULT_THUMBNAIL_MAX_BYTES_KB = 256;
const DEFAULT_THUMBNAIL_PREFETCH_LIMIT = 18;
const MAX_CACHED_THUMBNAILS = 120;
const GENERATED_THUMBNAIL_MAX_EDGE_PX = 160;
const GENERATED_THUMBNAIL_MIN_EDGE_PX = 24;
const GENERATED_THUMBNAIL_QUALITY_STEPS = [0.82, 0.7, 0.58, 0.46];

type ThumbnailPanelKind = PanelKind | 'secondaryRemote';

type UseFtpThumbnailsOptions = {
  ftpStore: ReturnType<typeof useFtpStore>;
  filteredLocalEntries: ComputedRef<FileTransferEntry[]>;
  filteredRemoteEntries: ComputedRef<FileTransferEntry[]>;
  filteredSecondaryRemoteEntries: ComputedRef<FileTransferEntry[]>;
  secondaryRemoteSessionId: ComputedRef<string>;
};

export function useFtpThumbnails(options: UseFtpThumbnailsOptions) {
  const thumbnailsEnabled = ref(true);
  const thumbnailMaxBytesKb = ref(String(DEFAULT_THUMBNAIL_MAX_BYTES_KB));
  const thumbnailPrefetchLimit = ref(String(DEFAULT_THUMBNAIL_PREFETCH_LIMIT));
  const thumbnailUrls = ref<Record<string, string>>({});
  const thumbnailLoadingKeys = ref<string[]>([]);

  function resetThumbnailCache() {
    thumbnailUrls.value = {};
    thumbnailLoadingKeys.value = [];
  }

  function persistThumbnailPreferences() {
    window.localStorage.setItem(FTP_THUMBNAIL_STORAGE_KEY, JSON.stringify({
      enabled: thumbnailsEnabled.value,
      maxBytesKb: thumbnailMaxBytesKb.value,
      prefetchLimit: thumbnailPrefetchLimit.value,
    }));
  }

  function toggleThumbnails() {
    thumbnailsEnabled.value = !thumbnailsEnabled.value;
    persistThumbnailPreferences();
  }

  function setThumbnailMaxBytesKb(value: string) {
    thumbnailMaxBytesKb.value = String(Math.max(1, Number(value.replace(/\D/g, '')) || DEFAULT_THUMBNAIL_MAX_BYTES_KB));
    resetThumbnailCache();
    persistThumbnailPreferences();
  }

  function setThumbnailPrefetchLimit(value: string) {
    thumbnailPrefetchLimit.value = String(Math.max(1, Number(value.replace(/\D/g, '')) || DEFAULT_THUMBNAIL_PREFETCH_LIMIT));
    persistThumbnailPreferences();
  }

  function thumbnailCacheKey(kind: ThumbnailPanelKind, entry: FileTransferEntry) {
    if (kind === 'remote') {
      return `remote:${options.ftpStore.activeSessionId}:${entry.path}`;
    }
    if (kind === 'secondaryRemote') {
      return `secondaryRemote:${options.secondaryRemoteSessionId.value}:${entry.path}`;
    }
    return `local:${entry.path}`;
  }

  function isImageEntry(entry: FileTransferEntry) {
    return /\.(jpg|jpeg|png|gif|bmp|webp|svg)$/i.test(entry.name);
  }

  function thumbnailUrlFor(kind: ThumbnailPanelKind, entry: FileTransferEntry) {
    return thumbnailUrls.value[thumbnailCacheKey(kind, entry)] || '';
  }

  function isThumbnailLoading(kind: ThumbnailPanelKind, entry: FileTransferEntry) {
    return thumbnailLoadingKeys.value.includes(thumbnailCacheKey(kind, entry));
  }

  function parsedThumbnailMaxBytes() {
    return Math.max(1, Number(thumbnailMaxBytesKb.value) || DEFAULT_THUMBNAIL_MAX_BYTES_KB) * 1024;
  }

  function parsedThumbnailPrefetchLimit() {
    return Math.max(1, Number(thumbnailPrefetchLimit.value) || DEFAULT_THUMBNAIL_PREFETCH_LIMIT);
  }

  function dataUrlBytes(dataUrl: string) {
    const encoded = dataUrl.split(',', 2)[1] || '';
    const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0;
    return Math.floor((encoded.length * 3) / 4) - padding;
  }

  function loadImage(dataUrl: string) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new window.Image();
      image.decoding = 'async';
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('failed to decode thumbnail image'));
      image.src = dataUrl;
    });
  }

  async function generateCompressedThumbnail(dataUrl: string, maxBytes: number) {
    if (dataUrlBytes(dataUrl) <= maxBytes / 2) {
      return dataUrl;
    }
    const image = await loadImage(dataUrl);
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    if (!sourceWidth || !sourceHeight) {
      return dataUrl;
    }
    const largestEdge = Math.max(sourceWidth, sourceHeight);
    const scale = Math.min(1, GENERATED_THUMBNAIL_MAX_EDGE_PX / largestEdge);
    let targetWidth = Math.max(GENERATED_THUMBNAIL_MIN_EDGE_PX, Math.round(sourceWidth * scale));
    let targetHeight = Math.max(GENERATED_THUMBNAIL_MIN_EDGE_PX, Math.round(sourceHeight * scale));
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) {
      return dataUrl;
    }

    let bestCandidate = dataUrl;
    let bestCandidateBytes = dataUrlBytes(dataUrl);

    while (targetWidth >= GENERATED_THUMBNAIL_MIN_EDGE_PX && targetHeight >= GENERATED_THUMBNAIL_MIN_EDGE_PX) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      context.clearRect(0, 0, targetWidth, targetHeight);
      context.drawImage(image, 0, 0, targetWidth, targetHeight);

      for (const quality of GENERATED_THUMBNAIL_QUALITY_STEPS) {
        const candidate = canvas.toDataURL('image/webp', quality);
        const candidateBytes = dataUrlBytes(candidate);
        if (candidateBytes < bestCandidateBytes) {
          bestCandidate = candidate;
          bestCandidateBytes = candidateBytes;
        }
        if (candidateBytes <= maxBytes) {
          return candidate;
        }
      }

      targetWidth = Math.floor(targetWidth * 0.82);
      targetHeight = Math.floor(targetHeight * 0.82);
    }

    return bestCandidate;
  }

  function trimThumbnailCache(visibleKeys: string[]) {
    const keepKeys = new Set(visibleKeys);
    const orderedKeys = Object.keys(thumbnailUrls.value);
    for (const key of orderedKeys) {
      if (keepKeys.size >= MAX_CACHED_THUMBNAILS) break;
      keepKeys.add(key);
    }
    thumbnailUrls.value = Object.fromEntries(
      Object.entries(thumbnailUrls.value).filter(([key]) => keepKeys.has(key)),
    );
  }

  async function ensureEntryThumbnail(kind: ThumbnailPanelKind, entry: FileTransferEntry) {
    if (!thumbnailsEnabled.value || entry.isDir || !isImageEntry(entry)) return;
    const cacheKey = thumbnailCacheKey(kind, entry);
    if (thumbnailUrls.value[cacheKey] || thumbnailLoadingKeys.value.includes(cacheKey)) return;
    thumbnailLoadingKeys.value = [...thumbnailLoadingKeys.value, cacheKey];
    try {
      const maxBytes = parsedThumbnailMaxBytes();
      const remoteSessionId = kind === 'remote'
        ? options.ftpStore.activeSessionId
        : options.secondaryRemoteSessionId.value;
      const dataUrl = kind === 'local'
        ? await window.ftpApi.loadLocalImagePreview(entry.path, maxBytes)
        : remoteSessionId
          ? await window.ftpApi.loadRemoteImagePreview(remoteSessionId, entry.path, maxBytes)
          : null;
      if (dataUrl) {
        const optimizedDataUrl = await generateCompressedThumbnail(dataUrl, maxBytes).catch(() => dataUrl);
        thumbnailUrls.value = {
          ...thumbnailUrls.value,
          [cacheKey]: optimizedDataUrl,
        };
      }
    } finally {
      thumbnailLoadingKeys.value = thumbnailLoadingKeys.value.filter((item) => item !== cacheKey);
    }
  }

  async function ensureVisibleThumbnails() {
    if (!thumbnailsEnabled.value) return;
    const prefetchLimit = parsedThumbnailPrefetchLimit();
    const localImages = options.filteredLocalEntries.value
      .filter((entry) => !entry.isDir && isImageEntry(entry))
      .slice(0, prefetchLimit);
    const remoteImages = options.filteredRemoteEntries.value
      .filter((entry) => !entry.isDir && isImageEntry(entry))
      .slice(0, prefetchLimit);
    const secondaryRemoteImages = options.filteredSecondaryRemoteEntries.value
      .filter((entry) => !entry.isDir && isImageEntry(entry))
      .slice(0, prefetchLimit);
    trimThumbnailCache([
      ...localImages.map((entry) => thumbnailCacheKey('local', entry)),
      ...remoteImages.map((entry) => thumbnailCacheKey('remote', entry)),
      ...secondaryRemoteImages.map((entry) => thumbnailCacheKey('secondaryRemote', entry)),
    ]);
    await Promise.allSettled([
      ...localImages.map((entry) => ensureEntryThumbnail('local', entry)),
      ...remoteImages.map((entry) => ensureEntryThumbnail('remote', entry)),
      ...secondaryRemoteImages.map((entry) => ensureEntryThumbnail('secondaryRemote', entry)),
    ]);
  }

  watch(
    () => [
      thumbnailsEnabled.value,
      thumbnailMaxBytesKb.value,
      thumbnailPrefetchLimit.value,
      options.ftpStore.activeSessionId,
      options.secondaryRemoteSessionId.value,
      options.filteredLocalEntries.value.map((entry) => entry.path).join('|'),
      options.filteredRemoteEntries.value.map((entry) => entry.path).join('|'),
      options.filteredSecondaryRemoteEntries.value.map((entry) => entry.path).join('|'),
    ],
    () => {
      void ensureVisibleThumbnails();
    },
    { immediate: true },
  );

  onMounted(() => {
    try {
      const raw = window.localStorage.getItem(FTP_THUMBNAIL_STORAGE_KEY);
      if (raw !== null) {
        const parsed = JSON.parse(raw) as Partial<{
          enabled: boolean;
          maxBytesKb: string;
          prefetchLimit: string;
        }>;
        thumbnailsEnabled.value = parsed.enabled !== false;
        thumbnailMaxBytesKb.value = typeof parsed.maxBytesKb === 'string' ? parsed.maxBytesKb : String(DEFAULT_THUMBNAIL_MAX_BYTES_KB);
        thumbnailPrefetchLimit.value = typeof parsed.prefetchLimit === 'string' ? parsed.prefetchLimit : String(DEFAULT_THUMBNAIL_PREFETCH_LIMIT);
      }
    } catch {
      thumbnailsEnabled.value = true;
      thumbnailMaxBytesKb.value = String(DEFAULT_THUMBNAIL_MAX_BYTES_KB);
      thumbnailPrefetchLimit.value = String(DEFAULT_THUMBNAIL_PREFETCH_LIMIT);
    }
  });

  return {
    thumbnailsEnabled,
    thumbnailMaxBytesKb,
    thumbnailPrefetchLimit,
    toggleThumbnails,
    setThumbnailMaxBytesKb,
    setThumbnailPrefetchLimit,
    thumbnailUrlFor,
    isThumbnailLoading,
  };
}
