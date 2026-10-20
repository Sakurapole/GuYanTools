/**
 * Structured plugin API errors.
 * Host services and IPC handlers should throw PluginApiError so SDK clients
 * receive a stable code instead of free-form strings.
 */
export type PluginApiErrorCode =
  | 'PERMISSION_DENIED'
  | 'INVALID_INPUT'
  | 'INCOMPATIBLE_HOST'
  | 'FILE_NOT_GRANTED'
  | 'NETWORK_FAILED'
  | 'NETWORK_PRIVATE_DENIED'
  | 'NETWORK_RESPONSE_TOO_LARGE'
  | 'TOOL_UNAVAILABLE'
  | 'TOOL_FAILED'
  | 'JOB_NOT_FOUND'
  | 'JOB_CANCELLED'
  | 'QUOTA_EXCEEDED'
  | 'PLUGIN_DISABLED'
  | 'PLUGIN_NOT_FOUND'
  | 'OWNER_MISMATCH'
  | 'INTERNAL';

export interface PluginApiErrorPayload {
  code: PluginApiErrorCode;
  message: string;
  retryable: boolean;
  details?: unknown;
}

const RETRYABLE_CODES = new Set<PluginApiErrorCode>([
  'NETWORK_FAILED',
  'TOOL_FAILED',
  'QUOTA_EXCEEDED',
]);

export class PluginApiError extends Error {
  readonly code: PluginApiErrorCode;
  readonly retryable: boolean;
  readonly details?: unknown;

  constructor(code: PluginApiErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'PluginApiError';
    this.code = code;
    this.retryable = RETRYABLE_CODES.has(code);
    this.details = details;
  }

  toPayload(): PluginApiErrorPayload {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      details: this.details,
    };
  }
}

export function isPluginApiError(error: unknown): error is PluginApiError {
  return error instanceof PluginApiError;
}

const LEGACY_CODE_PATTERNS: Array<[RegExp, PluginApiErrorCode]> = [
  [
    /MODEL_ENVIRONMENT_READ_ONLY|MODEL_ENVIRONMENT_PATH_DENIED|MODEL_PACKAGE_PROTECTED/,
    'PERMISSION_DENIED',
  ],
  [/MODEL_ENVIRONMENT_BUSY/, 'TOOL_UNAVAILABLE'],
  [/MODEL_ENVIRONMENT_NOT_FOUND/, 'INVALID_INPUT'],
  [/MODEL_PYTHON_VERSION_MISMATCH/, 'INCOMPATIBLE_HOST'],
  [/MODEL_JOB_CANCELLED/, 'JOB_CANCELLED'],
  [/MODEL_PROCESS_TIMEOUT/, 'TOOL_FAILED'],
  [/MODEL_PLUGIN_NOT_TRUSTED|MODEL_PERMISSION_DENIED/, 'PERMISSION_DENIED'],
  [/PLUGIN_PERMISSION_DENIED/, 'PERMISSION_DENIED'],
  [/PLUGIN_APPROVED_PERMISSION_INVALID/, 'PERMISSION_DENIED'],
  [/PLUGIN_OWNER_MISMATCH|PLUGIN_JOB_OWNER_MISMATCH/, 'OWNER_MISMATCH'],
  [
    /PLUGIN_FILE_ACCESS_DENIED|PLUGIN_FILE_PATH_DENIED|PLUGIN_FILE_GRANT_INVALID|PLUGIN_FILE_SIZE_DENIED/,
    'FILE_NOT_GRANTED',
  ],
  [/PLUGIN_NETWORK_PRIVATE_DENIED/, 'NETWORK_PRIVATE_DENIED'],
  [/PLUGIN_NETWORK_RESPONSE_TOO_LARGE/, 'NETWORK_RESPONSE_TOO_LARGE'],
  [/PLUGIN_NETWORK_/, 'NETWORK_FAILED'],
  [/PLUGIN_JOB_NOT_FOUND/, 'JOB_NOT_FOUND'],
  [/PLUGIN_JOB_CANCELLED/, 'JOB_CANCELLED'],
  [/PLUGIN_.*QUOTA|QUOTA_EXCEEDED/, 'QUOTA_EXCEEDED'],
  [/PLUGIN_DISABLED/, 'PLUGIN_DISABLED'],
  [/PLUGIN_NOT_FOUND|is not registered/, 'PLUGIN_NOT_FOUND'],
  [/TOOL_UNAVAILABLE/, 'TOOL_UNAVAILABLE'],
  [/TOOL_FAILED|TOOL_TIMEOUT/, 'TOOL_FAILED'],
  [/INCOMPATIBLE|UNSUPPORTED/, 'INCOMPATIBLE_HOST'],
  [/INVALID|DENIED/, 'INVALID_INPUT'],
];

export function normalizePluginError(error: unknown): PluginApiError {
  if (isPluginApiError(error)) return error;
  const message = error instanceof Error ? error.message : String(error);
  for (const [pattern, code] of LEGACY_CODE_PATTERNS) {
    if (pattern.test(message)) {
      return new PluginApiError(code, message);
    }
  }
  return new PluginApiError('INTERNAL', message);
}

export function toPluginApiErrorPayload(error: unknown): PluginApiErrorPayload {
  return normalizePluginError(error).toPayload();
}
