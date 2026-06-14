import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import process from 'node:process';
import type {
  AiMcpEnvironmentVariable,
  AiMcpRuntimeServerStatus,
  AiMcpServerConfig,
  AiMcpToolCallResult,
  AiMcpToolSummary,
  GetModelScopeMcpServerPayload,
  ListModelScopeMcpServersPayload,
  ListModelScopeMcpServersResult,
  ModelScopeMcpServerDetail,
  ModelScopeMcpServerSummary,
  StartAiMcpServerResult,
} from '@/contracts/ai';
import { appConfigManager } from '@/main/app-config/manager';

type RuntimeRecord = AiMcpRuntimeServerStatus & {
  process?: ChildProcessWithoutNullStreams;
};

const MODELSCOPE_OPENAPI_BASE = 'https://modelscope.cn/openapi/v1';

class AiMcpService {
  private readonly runtimes = new Map<string, RuntimeRecord>();

  async listModelScopeServers(input: ListModelScopeMcpServersPayload): Promise<ListModelScopeMcpServersResult> {
    const config = (await appConfigManager.getConfig()).features.aiAgent;
    const payload = {
      page: Math.max(1, Math.round(input.page ?? 1)),
      page_size: Math.max(1, Math.min(50, Math.round(input.pageSize ?? 12))),
      ...(input.search?.trim() ? { search: input.search.trim() } : {}),
    };
    const json = await fetchModelScopeJson('/mcp/servers', {
      method: 'PUT',
      apiToken: input.apiToken || config.mcp.modelscopeApiToken,
      body: payload,
    });
    const data = readRecord(json.data);
    const list = Array.isArray(data.mcp_server_list) ? data.mcp_server_list : [];
    return {
      servers: list.map(mapModelScopeSummary).filter((server): server is ModelScopeMcpServerSummary => Boolean(server)),
      total: toNumber(data.total_count) ?? list.length,
    };
  }

  async getModelScopeServer(input: GetModelScopeMcpServerPayload): Promise<ModelScopeMcpServerDetail> {
    const config = (await appConfigManager.getConfig()).features.aiAgent;
    const json = await fetchModelScopeJson(`/mcp/servers/${encodeURIComponent(input.id)}`, {
      method: 'GET',
      apiToken: input.apiToken || config.mcp.modelscopeApiToken,
    });
    const data = readRecord(json.data);
    const summary = mapModelScopeSummary(data) ?? {
      id: input.id,
      name: input.id,
      description: '',
      categories: [],
      tags: [],
      viewCount: 0,
    };
    const serverConfigJson = JSON.stringify(data.server_config ?? [], null, 2);
    return {
      ...summary,
      sourceUrl: optionalString(data.source_url),
      readme: optionalString(data.readme),
      operationalUrls: Array.isArray(data.operational_urls)
        ? data.operational_urls.map((url) => String(url)).filter(Boolean)
        : [],
      serverConfigJson,
      importableServer: parseModelScopeServerConfig(summary, data.server_config),
    };
  }

  async getStatuses(): Promise<AiMcpRuntimeServerStatus[]> {
    const config = (await appConfigManager.getConfig()).features.aiAgent;
    return config.mcp.servers.map((server) => this.statusFor(server));
  }

  async startServer(serverId: string): Promise<StartAiMcpServerResult> {
    const config = (await appConfigManager.getConfig()).features.aiAgent;
    const server = config.mcp.servers.find((item) => item.id === serverId);
    if (!server) {
      throw new Error('MCP 服务器不存在');
    }
    if (!server.enabled) {
      throw new Error('MCP 服务器已禁用');
    }
    if (server.transport !== 'stdio') {
      const remoteStatus: AiMcpRuntimeServerStatus = {
        id: server.id,
        status: 'running',
        lastOutput: server.url,
      };
      this.runtimes.set(server.id, remoteStatus);
      return remoteStatus;
    }
    if (!server.command) {
      throw new Error('MCP stdio 服务器缺少启动命令');
    }

    const existing = this.runtimes.get(server.id);
    if (existing?.process && existing.status === 'running') {
      return sanitizeStatus(existing);
    }

    const runtime: RuntimeRecord = {
      id: server.id,
      status: 'starting',
      startedAt: Date.now(),
      lastOutput: '',
    };
    this.runtimes.set(server.id, runtime);

    try {
      const child = spawn(server.command, server.args, {
        cwd: server.cwd || undefined,
        env: {
          ...process.env,
          ...Object.fromEntries(server.env.map((item) => [item.key, item.value])),
        },
        shell: false,
        windowsHide: true,
      });
      runtime.process = child;
      runtime.pid = child.pid;
      runtime.status = 'running';

      child.stdout.on('data', (chunk) => {
        runtime.lastOutput = trimRuntimeOutput(`${runtime.lastOutput ?? ''}${String(chunk)}`);
      });
      child.stderr.on('data', (chunk) => {
        runtime.lastOutput = trimRuntimeOutput(`${runtime.lastOutput ?? ''}${String(chunk)}`);
      });
      child.on('error', (error) => {
        runtime.status = 'error';
        runtime.error = error.message;
      });
      child.on('exit', (code) => {
        runtime.status = code === 0 ? 'stopped' : 'error';
        runtime.lastExitCode = code;
        runtime.process = undefined;
      });

      return sanitizeStatus(runtime);
    } catch (error) {
      runtime.status = 'error';
      runtime.error = error instanceof Error ? error.message : String(error);
      return sanitizeStatus(runtime);
    }
  }

  async stopServer(serverId: string): Promise<AiMcpRuntimeServerStatus> {
    const runtime = this.runtimes.get(serverId);
    if (!runtime) {
      return { id: serverId, status: 'stopped' };
    }
    if (runtime.process && runtime.status === 'running') {
      runtime.process.kill();
    }
    runtime.status = 'stopped';
    runtime.process = undefined;
    return sanitizeStatus(runtime);
  }

  async listTools(): Promise<AiMcpToolSummary[]> {
    const config = (await appConfigManager.getConfig()).features.aiAgent;
    if (!config.mcp.enabled) {
      return [];
    }

    const enabledServers = config.mcp.servers.filter((server) =>
      server.enabled && server.transport === 'http' && Boolean(server.url));
    const results = await Promise.allSettled(enabledServers.map(async (server) => {
      const response = await callMcpJsonRpc(server, 'tools/list');
      const tools = Array.isArray(readRecord(response.result).tools) ? readRecord(response.result).tools as unknown[] : [];
      return tools
        .map((tool) => mapMcpTool(server, tool))
        .filter((tool): tool is AiMcpToolSummary => Boolean(tool))
        .filter((tool) => isReadOnlyToolName(tool.name));
    }));
    return results.flatMap((result) => result.status === 'fulfilled' ? result.value : []);
  }

  async callReadTool(input: {
    serverId: string;
    toolName: string;
    arguments?: Record<string, unknown>;
  }): Promise<AiMcpToolCallResult> {
    const config = (await appConfigManager.getConfig()).features.aiAgent;
    if (!config.mcp.enabled) {
      throw new Error('MCP 已禁用');
    }
    const server = config.mcp.servers.find((item) => item.id === input.serverId);
    if (!server || !server.enabled || server.transport !== 'http' || !server.url) {
      throw new Error('仅支持已启用的 HTTP MCP 读取工具');
    }
    if (!isReadOnlyToolName(input.toolName)) {
      throw new Error('非 Agent 聊天不允许调用写入、删除、执行类 MCP 工具');
    }

    const response = await callMcpJsonRpc(server, 'tools/call', {
      name: input.toolName,
      arguments: input.arguments ?? {},
    });
    const text = stringifyMcpToolResult(response.result);
    return {
      serverId: server.id,
      toolName: input.toolName,
      title: `${server.name} / ${input.toolName}`,
      text,
      raw: response.result,
    };
  }

  private statusFor(server: AiMcpServerConfig): AiMcpRuntimeServerStatus {
    const runtime = this.runtimes.get(server.id);
    if (runtime) {
      return sanitizeStatus(runtime);
    }
    return {
      id: server.id,
      status: 'stopped',
    };
  }
}

async function callMcpJsonRpc(server: AiMcpServerConfig, method: string, params?: Record<string, unknown>) {
  if (!server.url) {
    throw new Error('MCP HTTP server missing url');
  }
  const response = await fetch(server.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      method,
      params,
    }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `MCP HTTP ${response.status}`);
  }
  const jsonText = text.trim().startsWith('event:')
    ? text.split('\n').find((line) => line.startsWith('data:'))?.slice(5).trim() ?? '{}'
    : text;
  const json = JSON.parse(jsonText) as Record<string, unknown>;
  if (json.error) {
    throw new Error(JSON.stringify(json.error));
  }
  return json;
}

function mapMcpTool(server: AiMcpServerConfig, value: unknown): AiMcpToolSummary | null {
  const tool = readRecord(value);
  const name = optionalString(tool.name);
  if (!name) {
    return null;
  }
  return {
    serverId: server.id,
    serverName: server.name,
    name,
    description: optionalString(tool.description),
    inputSchema: readRecord(tool.inputSchema),
  };
}

function isReadOnlyToolName(name: string) {
  return !/(write|delete|remove|create|update|edit|patch|insert|execute|run|shell|command|upload|move|rename|grant|revoke|send|post)/i
    .test(name);
}

function stringifyMcpToolResult(result: unknown) {
  const record = readRecord(result);
  const content = Array.isArray(record.content) ? record.content : [];
  const text = content.map((part) => {
    const item = readRecord(part);
    if (typeof item.text === 'string') {
      return item.text;
    }
    return JSON.stringify(item);
  }).filter(Boolean).join('\n\n');
  return text || JSON.stringify(result, null, 2);
}

async function fetchModelScopeJson(path: string, options: {
  method: 'GET' | 'PUT';
  apiToken?: string;
  body?: Record<string, unknown>;
}) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (options.apiToken?.trim()) {
    headers.Authorization = `Bearer ${options.apiToken.trim()}`;
  }
  const response = await fetch(`${MODELSCOPE_OPENAPI_BASE}${path}`, {
    method: options.method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `魔搭 MCP 请求失败：HTTP ${response.status}`);
  }
  const json = JSON.parse(text) as Record<string, unknown>;
  if (json.success === false) {
    throw new Error(String(json.message || '魔搭 MCP 请求失败'));
  }
  return json;
}

function mapModelScopeSummary(value: unknown): ModelScopeMcpServerSummary | null {
  const item = readRecord(value);
  const id = optionalString(item.id);
  if (!id) {
    return null;
  }
  const locales = readRecord(item.locales);
  const zh = readRecord(locales.zh);
  const en = readRecord(locales.en);
  return {
    id,
    name: optionalString(zh.name) || optionalString(item.chinese_name) || optionalString(item.name) || optionalString(en.name) || id,
    description: optionalString(zh.description) || optionalString(item.description) || optionalString(en.description) || '',
    categories: normalizeStringArray(item.categories),
    tags: normalizeStringArray(item.tags),
    logoUrl: optionalString(item.logo_url),
    viewCount: toNumber(item.view_count) ?? 0,
  };
}

function parseModelScopeServerConfig(summary: ModelScopeMcpServerSummary, serverConfig: unknown): AiMcpServerConfig | undefined {
  const configs = Array.isArray(serverConfig) ? serverConfig : [serverConfig];
  for (const config of configs) {
    const mcpServers = readRecord(readRecord(config).mcpServers);
    const [serverName, rawServer] = Object.entries(mcpServers)[0] ?? [];
    if (!serverName || !rawServer) {
      continue;
    }
    const server = readRecord(rawServer);
    const timestamp = Date.now();
    const url = optionalString(server.url);
    const command = optionalString(server.command);
    return {
      id: createLocalServerId(summary.id),
      name: summary.name || serverName,
      enabled: true,
      source: 'modelscope',
      sourceId: summary.id,
      transport: url ? inferRemoteTransport(url) : 'stdio',
      command,
      args: normalizeStringArray(server.args),
      cwd: optionalString(server.cwd),
      url,
      env: normalizeEnvConfig(server.env),
      autoStart: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }
  return undefined;
}

function createLocalServerId(sourceId: string) {
  const normalized = sourceId
    .replace(/^@/, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return `modelscope-${normalized || Date.now()}`;
}

function inferRemoteTransport(url: string) {
  return url.includes('/sse') || url.includes('transport=sse') ? 'sse' : 'http';
}

function normalizeEnvConfig(value: unknown): AiMcpEnvironmentVariable[] {
  const env = readRecord(value);
  return Object.entries(env)
    .filter(([key]) => key.trim())
    .map(([key, rawValue]) => ({
      id: key,
      key,
      value: typeof rawValue === 'string' ? rawValue : String(rawValue ?? ''),
      secret: /key|token|secret|password/i.test(key),
    }));
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function normalizeStringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

function toNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function trimRuntimeOutput(value: string) {
  return value.length > 4000 ? value.slice(-4000) : value;
}

function sanitizeStatus(runtime: RuntimeRecord): AiMcpRuntimeServerStatus {
  return {
    id: runtime.id,
    status: runtime.status,
    pid: runtime.pid,
    startedAt: runtime.startedAt,
    lastExitCode: runtime.lastExitCode,
    lastOutput: runtime.lastOutput,
    error: runtime.error,
  };
}

export const aiMcpService = new AiMcpService();
