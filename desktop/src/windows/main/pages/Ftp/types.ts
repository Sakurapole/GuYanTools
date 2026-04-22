import type { FileTransferEntry, FtpProfile, FtpSessionFolder } from '@/contracts/ftp';
import type { UiTreeNodeData } from '@/windows/main/components/ui/ui_tree';

export type PanelKind = 'local' | 'remote';
export type PanelViewMode = 'list' | 'details';
export type PanelFilterMode = 'all' | 'files' | 'folders';
export type PanelFilterOperator = 'and' | 'or';
export type EntrySortKey = 'name' | 'size' | 'modifiedAt' | 'type';
export type TaskSortKey = 'createdAt' | 'fileName' | 'fileSize' | 'status' | 'priority';

export type PanelFilterState = {
  mode: PanelFilterMode;
  operator: PanelFilterOperator;
  hideHidden: boolean;
  extensionQuery: string;
  minSizeKb: string;
  maxSizeKb: string;
  modifiedWithinDays: string;
};

export type PanelFilterPreset = {
  id: string;
  name: string;
  filter: PanelFilterState;
  builtIn?: boolean;
};

export type ConfigTreeNodeKind = 'folder' | 'profile' | 'group';

export type ConfigTreeNode = UiTreeNodeData & {
  kind: ConfigTreeNodeKind;
  data?: FtpSessionFolder | FtpProfile;
};

export type SyncDirection = 'localToRemote' | 'remoteToLocal' | 'bidirectional';
export type SyncConflictPolicy = 'keepNewer' | 'preferLocal' | 'preferRemote' | 'skipConflicts';
export type SyncDiffStatus = 'localOnly' | 'remoteOnly' | 'different' | 'same';
export type SyncDifferenceKind = 'type' | 'size' | 'modifiedAt' | 'content';
export type SyncContentVerification = 'notCompared' | 'same' | 'different';

export type SyncComparisonItem = {
  key: string;
  name: string;
  relativePath: string;
  depth: number;
  localEntry: FileTransferEntry | null;
  remoteEntry: FileTransferEntry | null;
  status: SyncDiffStatus;
  transferSize: number;
  differenceKinds: SyncDifferenceKind[];
  contentVerification: SyncContentVerification;
};

export type SyncActionKind =
  | 'upload'
  | 'download'
  | 'deleteRemote'
  | 'deleteLocal'
  | 'replaceRemote'
  | 'replaceLocal'
  | 'skip';

export type SyncPreviewItem = SyncComparisonItem & {
  action: SyncActionKind;
};

export type FtpProfileFormState = {
  label: string;
  protocol: string;
  host: string;
  port: string;
  username: string;
  authType: string;
  savePassword: boolean;
  password: string;
  privateKeyPath: string;
  certificatePath: string;
  hostCaKeyPath: string;
  privateKeyPassphrase: string;
  sshProfileId: string;
  folderId: string;
  defaultRemotePath: string;
  defaultLocalPath: string;
  maxConcurrent: string;
};

export type FtpFolderFormState = {
  label: string;
  parentId: string;
};
