import { tool } from 'ai';
import { z } from 'zod';
import type { AiCitation, AiMcpToolSummary, AiStreamEvent } from '@/contracts/ai';
import { aiMcpService } from '../mcp_service';

type McpToolEmitter = (event: AiStreamEvent) => void;

export interface McpToolContext {
  runId: string;
  messageId: string;
  tools: AiMcpToolSummary[];
  citations: AiCitation[];
  emit: McpToolEmitter;
}

export function createMcpReadTools(context: McpToolContext) {
  if (!context.tools.length) {
    return undefined;
  }

  const availableTools = context.tools
    .map((item) => `${item.serverName}/${item.name}: ${item.description || '无描述'}`)
    .join('\n');

  return {
    mcpRead: tool({
      description: [
        'Call one configured read-only MCP tool and return its result as a cited source.',
        'Only use tools from this allowlist:',
        availableTools,
      ].join('\n'),
      inputSchema: z.object({
        serverId: z.string().min(1),
        toolName: z.string().min(1),
        argumentsJson: z.string().default('{}').describe('JSON object string passed as MCP tool arguments.'),
      }),
      execute: async (input) => {
        const selected = context.tools.find((item) =>
          item.serverId === input.serverId && item.name === input.toolName);
        if (!selected) {
          throw new Error('MCP 工具不在当前允许列表中');
        }
        const result = await aiMcpService.callReadTool({
          serverId: input.serverId,
          toolName: input.toolName,
          arguments: parseArguments(input.argumentsJson),
        });
        const citation: AiCitation = {
          id: `mcp-${context.messageId}-${context.citations.length + 1}`,
          sourceType: 'web',
          title: result.title,
          sourceId: `${result.serverId}:${result.toolName}`,
          snippet: result.text.slice(0, 500),
          metadata: {
            connector: 'mcp',
            serverId: result.serverId,
            toolName: result.toolName,
          },
        };
        context.citations.push(citation);
        context.emit({
          type: 'citation',
          runId: context.runId,
          messageId: context.messageId,
          citation,
        });
        return {
          source: result.title,
          text: result.text,
        };
      },
    }),
  };
}

function parseArguments(value: string) {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}
