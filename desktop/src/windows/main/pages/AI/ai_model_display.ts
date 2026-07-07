import type { AiModelCapabilities, AiProviderKind } from '@/contracts/ai';

export type AiModelDisplayItem = {
  id: string;
  displayName?: string;
  providerModelId?: string;
  capabilities?: Partial<AiModelCapabilities>;
};

export type AiModelPrefixGroup<T extends AiModelDisplayItem> = {
  prefix: string;
  items: T[];
};

export type AiModelCapabilityBadge = {
  key: 'streaming' | 'vision' | 'web' | 'reasoning' | 'embedding' | 'tool' | 'structured';
  label: string;
  icon: string;
};

export function groupModelsByPrefix<T extends AiModelDisplayItem>(models: T[]): AiModelPrefixGroup<T>[] {
  const groups = new Map<string, T[]>();
  for (const model of models) {
    const prefix = getModelPrefix(model.providerModelId || model.id || model.displayName || '');
    groups.set(prefix, [...(groups.get(prefix) ?? []), model]);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' }))
    .map(([prefix, items]) => ({
      prefix,
      items: [...items].sort((left, right) =>
        (left.displayName || left.id).localeCompare(right.displayName || right.id, undefined, {
          numeric: true,
          sensitivity: 'base',
        }),
      ),
    }));
}

export function getModelPrefix(modelId: string) {
  const normalized = modelId.trim().replace(/^models\//, '');
  if (!normalized) {
    return '未命名';
  }

  const ownerMatch = normalized.match(/^([^/]+)\//);
  if (ownerMatch?.[1]) {
    return ownerMatch[1];
  }

  const parts = normalized.split(/[-_]/).filter(Boolean);
  if (!parts.length) {
    return normalized;
  }
  if (parts.length === 1) {
    return parts[0];
  }

  const [family, version] = parts;
  if (family === 'text' && version === 'embedding') {
    return 'text-embedding';
  }
  if (['claude', 'gemini', 'gpt', 'llama'].includes(family) && version) {
    return `${family}-${version}`;
  }
  if (/^qwen/i.test(family) || family === 'deepseek' || family === 'mistral' || family === 'yi') {
    return family;
  }
  return family;
}

export function inferModelCapabilities(modelId: string, providerKind?: AiProviderKind): Partial<AiModelCapabilities> {
  const id = modelId.toLowerCase();
  const embedding = isEmbeddingModelId(id);
  const rerank = isRerankModelId(id);
  const vision = /(^|[-_/])(vision|visual|vl|omni|image)([-_/]|$)|gpt-4o|gemini|claude-3|qwen-vl/.test(id);
  const reasoning = /(^|[-_/])(reasoning|reasoner|thinking|think|r1|o1|o3|o4)([-_/]|$)|deepseek-r1|qwen3/.test(id);
  const nativeWebSearch = isWebSearchModelId(id);
  const toolCalling = providerKind !== 'ollama' && !embedding && !rerank;
  return {
    streaming: !embedding && !rerank,
    embedding,
    vision,
    reasoning,
    nativeWebSearch,
    toolCalling,
    structuredOutput: toolCalling,
  };
}

export function getModelCapabilityBadges(capabilities: Partial<AiModelCapabilities>): AiModelCapabilityBadge[] {
  const badges: AiModelCapabilityBadge[] = [];
  if (capabilities.vision) {
    badges.push({ key: 'vision', label: '视觉', icon: 'iconify:lucide:eye' });
  }
  if (capabilities.nativeWebSearch) {
    badges.push({ key: 'web', label: '联网', icon: 'iconify:lucide:globe-2' });
  }
  if (capabilities.reasoning) {
    badges.push({ key: 'reasoning', label: '推理', icon: 'iconify:lucide:sparkles' });
  }
  if (capabilities.embedding) {
    badges.push({ key: 'embedding', label: '嵌入', icon: 'iconify:lucide:box' });
  }
  if (capabilities.toolCalling) {
    badges.push({ key: 'tool', label: '工具', icon: 'iconify:lucide:wrench' });
  }
  if (capabilities.structuredOutput) {
    badges.push({ key: 'structured', label: '结构化输出', icon: 'iconify:lucide:braces' });
  }
  return badges;
}

export function isEmbeddingModelId(modelId: string) {
  return /(^|[-_/])(embed|embedding|embeddings|bge|e5|gte)([-_/]|$)|text-embedding/.test(modelId.toLowerCase());
}

export function isRerankModelId(modelId: string) {
  return /(^|[-_/])(rerank|reranker|reranking|rank)([-_/]|$)/.test(modelId.toLowerCase());
}

export function isWebSearchModelId(modelId: string) {
  return /(^|[-_/])(web|search|online|sonar)([-_/]|$)/.test(modelId.toLowerCase());
}

export function isFreeModelId(modelId: string) {
  return /(^|[-_/])(free|trial|gratis)([-_/]|$)/.test(modelId.toLowerCase());
}
