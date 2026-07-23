export interface PublishConfig {
  repository: string;
  marketplace: string;
  catalogMode: 'pull-request' | 'direct';
  releaseAsset: boolean;
  rootPath?: string;
}

export interface MarketplaceCatalogEntry {
  id: string;
  version: string;
  repository: string;
  ref: string;
  refType: 'tag' | 'branch' | 'commit';
  resolvedCommit: string;
  permissions: string[];
  capabilities: unknown[];
}

export interface PublishResult {
  tag: string;
  releaseAssetPath: string;
  catalogEntry: MarketplaceCatalogEntry;
  commands: string[];
}
