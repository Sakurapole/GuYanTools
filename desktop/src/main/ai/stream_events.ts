import type { AiStreamEvent, AiTokenUsage } from '@/contracts/ai';

export function mapAiSdkPartToAiEvent(part: unknown, runId: string, messageId: string): AiStreamEvent | null {
  if (!part || typeof part !== 'object') {
    return null;
  }

  const typed = part as {
    type?: string;
    text?: string;
    textDelta?: string;
    delta?: string;
    toolCallId?: string;
    toolName?: string;
    argsTextDelta?: string;
    error?: unknown;
    finishReason?: string;
    totalUsage?: AiTokenUsage;
    usage?: AiTokenUsage;
  };

  if (typed.type === 'text-delta' || typed.type === 'text') {
    const delta = typed.textDelta ?? typed.text ?? typed.delta ?? '';
    return delta ? { type: 'text-delta', runId, messageId, delta } : null;
  }

  if ((typed.type === 'reasoning-delta' || typed.type === 'reasoning') && (typed.textDelta || typed.text || typed.delta)) {
    return { type: 'reasoning-delta', runId, messageId, delta: typed.textDelta ?? typed.text ?? typed.delta ?? '' };
  }

  if (typed.type === 'tool-call-streaming-start' && typed.toolCallId && typed.toolName) {
    return { type: 'tool-call-start', runId, toolCallId: typed.toolCallId, toolName: typed.toolName };
  }

  if (typed.type === 'tool-call-delta' && typed.toolCallId) {
    return { type: 'tool-call-delta', runId, toolCallId: typed.toolCallId, delta: typed.argsTextDelta ?? typed.delta ?? '' };
  }

  if (typed.type === 'finish') {
    const usage = normalizeUsage(typed.totalUsage ?? typed.usage);
    return usage ? { type: 'usage', runId, messageId, usage } : null;
  }

  if (typed.type === 'error') {
    return {
      type: 'run-error',
      runId,
      message: typed.error instanceof Error ? typed.error.message : String(typed.error ?? 'AI stream failed'),
      retryable: true,
    };
  }

  return null;
}

export function normalizeUsage(value: unknown): AiTokenUsage | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const usage = value as Record<string, unknown>;
  return {
    inputTokens: toNumber(usage.inputTokens ?? usage.promptTokens),
    outputTokens: toNumber(usage.outputTokens ?? usage.completionTokens),
    totalTokens: toNumber(usage.totalTokens),
  };
}

function toNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
