import { generateText } from 'ai';
import { resolveLanguageModel } from './provider_registry';
import type { AiAgentFeatureConfig } from '@/contracts/ai';

export async function generateConversationTitle(config: AiAgentFeatureConfig, providerId: string, modelId: string, content: string) {
  const trimmed = content.trim();
  if (!trimmed) {
    return '新的对话';
  }

  try {
    const result = await generateText({
      model: resolveLanguageModel(config, providerId, modelId),
      prompt: `请为下面的对话生成一个不超过 18 个中文字符的标题，只输出标题：\n${trimmed.slice(0, 1200)}`,
      maxOutputTokens: 40,
      temperature: 0.2,
    });
    const title = result.text.replace(/^["“”]+|["“”]+$/g, '').trim();
    return title || trimmed.slice(0, 18);
  } catch {
    return trimmed.slice(0, 18);
  }
}
