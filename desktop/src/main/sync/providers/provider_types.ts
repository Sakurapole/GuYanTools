import type {
  SyncCollectionKind,
  SyncConnectionResult,
  SyncObjectEnvelope,
  SyncProfileSummary,
} from '@/contracts/sync';

export interface SyncPullResult {
  profiles: SyncProfileSummary[];
  objects: SyncObjectEnvelope[];
  deletedObjects: SyncObjectEnvelope[];
  cursor?: number;
}

export interface SyncPushInput {
  deviceId: string;
  profiles: SyncObjectEnvelope[];
  objects: SyncObjectEnvelope[];
  tombstones: SyncObjectEnvelope[];
}

export interface SyncProviderPushConflict {
  conflictId?: string;
  collection: SyncObjectEnvelope['collection'];
  objectId: string;
  serverRev: string;
  serverPayload: unknown;
  attemptedPayload: unknown;
  deleted: boolean;
}

export interface SyncProviderAppliedObject {
  collection: SyncObjectEnvelope['collection'];
  objectId: string;
  serverRev: string;
}

export class SyncProviderObjectError extends Error {
  constructor(
    message: string,
    readonly collection: SyncCollectionKind,
    readonly objectId: string,
    readonly requestBytes?: number,
  ) {
    super(message);
    this.name = 'SyncProviderObjectError';
  }
}

export interface SyncProvider {
  testConnection(): Promise<SyncConnectionResult>;
  pull(): Promise<SyncPullResult>;
  ack?(cursor: number): Promise<void>;
  push(input: SyncPushInput): Promise<{
    pushed: number;
    cursor?: number;
    serverRev?: string;
    applied?: SyncProviderAppliedObject[];
    conflicts?: SyncProviderPushConflict[];
  }>;
  uploadAsset(key: string, bytes: Buffer, mimeType?: string): Promise<void>;
  downloadAsset(key: string): Promise<Buffer | null>;
}
