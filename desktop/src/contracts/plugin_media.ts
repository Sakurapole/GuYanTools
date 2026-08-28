export type PluginResponseType = 'json' | 'text' | 'bytes';

export interface PluginCredentialReference {
  secretKey: string;
  allowedOrigins: string[];
  headerName?: 'Cookie';
}

export interface NetworkRequest {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD';
  headers?: Record<string, string>;
  body?: string;
  responseType?: PluginResponseType;
  followRedirects?: boolean;
  credential?: PluginCredentialReference;
  timeoutMs?: number;
  maxBytes?: number;
}

export interface NetworkResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
  finalUrl: string;
}

export interface DownloadSource {
  url: string;
  fileName?: string;
  contentType?: string;
  expectedBytes?: number;
  sha256?: string;
}

export interface FileGrant {
  id: string;
  pluginId: string;
  purpose: string;
  rootPath: string;
  accessMode: 'read' | 'write' | 'read-write';
  expiresAt: string;
  maxBytes: number;
  revoked: boolean;
}

export interface JobRecord {
  id: string;
  pluginId: string;
  parentJobId?: string;
  kind: string;
  status: 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  currentStep?: string;
  input: unknown;
  output?: unknown;
  error?: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface MediaProbe {
  durationMs?: number;
  width?: number;
  height?: number;
  bitrate?: number;
  mimeType?: string;
  streams: Array<{ kind: 'audio' | 'video' | 'subtitle' | 'data'; codec?: string; language?: string }>;
}

export interface MediaTags {
  title?: string;
  artist?: string;
  album?: string;
  albumArtist?: string;
  date?: string;
  genre?: string;
  description?: string;
  artworkGrantId?: string;
  [key: string]: string | undefined;
}

export interface PreviewGrant {
  id: string;
  pluginId: string;
  url: string;
  expiresAt: string;
  mimeType?: string;
}

export interface PluginApiErrorShape {
  code: string;
  message: string;
  retryable?: boolean;
}
