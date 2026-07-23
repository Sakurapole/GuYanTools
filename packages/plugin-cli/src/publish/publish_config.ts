export interface PublishConfig {
  repository: string;
  marketplace: string;
  catalogMode: 'pull-request' | 'direct';
  releaseAsset: boolean;
  allowDirectPublish?: boolean;
  rootPath?: string;
  catalogRepository?: string;
  catalogBranch?: string;
}

export interface MarketplaceCatalogEntry {
  id: string;
  name: string;
  version: string;
  description?: string;
  repository: string;
  ref: string;
  refType: 'tag';
  resolvedCommit: string;
  hostVersionRange?: string;
  permissions: string[];
  capabilities: unknown[];
}

export interface CommandSpec {
  command: string;
  args: string[];
  cwd?: string;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
}

export interface CommandExecutor {
  run(command: CommandSpec): Promise<CommandResult>;
}

export interface PackedPlugin {
  archive: string;
  sha256: string;
}

export interface MarketplacePublishResult {
  repository: string;
  branch: string;
  mode: 'pull-request' | 'direct';
}

export interface PublishResult {
  tag: string;
  releaseAssetPath: string;
  sha256: string;
  catalogEntry: MarketplaceCatalogEntry;
  commands: string[];
  marketplace?: MarketplacePublishResult;
}
