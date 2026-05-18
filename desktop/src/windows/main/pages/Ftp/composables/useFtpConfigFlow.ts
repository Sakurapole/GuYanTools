import { computed, reactive, ref, watch, type Ref } from 'vue';
import type { FtpAuthChallenge, FtpProfile, FtpSessionFolder } from '@/contracts/ftp';
import type { SshProfile } from '@/contracts/ssh';
import { getErrorMessage, notifyError } from '@/windows/main/composables/useInAppNotification';
import type { useFtpStore } from '@/windows/main/stores/ftp_store';
import type { FtpFolderFormState, FtpProfileFormState } from '../types';

type HostVerificationPayload = {
  status: string;
  host: string;
  port: number;
  algorithm: string;
  fingerprint: string;
  storedFingerprint?: string;
};

type EntryNameDialogOptions = {
  title: string;
  label: string;
  confirmText?: string;
  initialValue?: string;
  placeholder?: string;
};

type UseFtpConfigFlowOptions = {
  ftpStore: ReturnType<typeof useFtpStore>;
  busyMessage: Ref<string>;
  actionError: Ref<string>;
  showConfirm: (options: {
    title: string;
    message: string;
    confirmText?: string;
    danger?: boolean;
  }) => Promise<boolean>;
};

export function useFtpConfigFlow(options: UseFtpConfigFlowOptions) {
  const sshProfiles = ref<SshProfile[]>([]);
  const profileDialogVisible = ref(false);
  const folderDialogVisible = ref(false);
  const passwordDialogVisible = ref(false);
  const authChallengeDialogVisible = ref(false);
  const entryNameDialogVisible = ref(false);
  const editingProfileId = ref('');
  const editingFolderId = ref('');
  const pendingConnectProfile = ref<FtpProfile | null>(null);
  const pendingAuthChallenge = ref<FtpAuthChallenge | null>(null);
  const connectPassword = ref('');
  const authChallengeResponses = ref<string[]>([]);
  const entryNameDialogTitle = ref('');
  const entryNameDialogLabel = ref('名称');
  const entryNameDialogConfirmText = ref('确定');
  const entryNameDialogValue = ref('');
  const entryNameDialogPlaceholder = ref('');
  let resolveEntryNameDialog: ((value: string | null) => void) | null = null;

  function setActionError(error: unknown, title = 'FTP 配置操作失败') {
    options.actionError.value = getErrorMessage(error);
    notifyError(error, title);
  }

  const profileForm = reactive<FtpProfileFormState>({
    label: '',
    protocol: 'sftp',
    host: '',
    port: '22',
    username: '',
    authType: 'password',
    savePassword: false,
    password: '',
    privateKeyPath: '',
    certificatePath: '',
    hostCaKeyPath: '',
    privateKeyPassphrase: '',
    sshProfileId: '',
    folderId: '',
    defaultRemotePath: '/',
    defaultLocalPath: '',
    maxConcurrent: '2',
  });

  const folderForm = reactive<FtpFolderFormState>({
    label: '',
    parentId: '',
  });

  const protocolOptions = [
    { label: 'SFTP', value: 'sftp' },
    { label: 'FTP', value: 'ftp' },
    { label: 'FTPS', value: 'ftps' },
  ];

  const authTypeOptions = computed(() => (
    profileForm.protocol === 'sftp'
      ? [
        { label: '密码', value: 'password' },
        { label: '私钥', value: 'privateKey' },
        { label: 'Keyboard-Interactive', value: 'keyboardInteractive' },
      ]
      : [{ label: '密码', value: 'password' }]
  ));

  const sshProfileEnabled = computed(() => true);
  const sshProfileLabel = computed(() => (
    profileForm.protocol === 'sftp' ? '复用 SSH' : 'SSH 隧道'
  ));

  const sshProfileOptions = computed(() => [
    { label: '不复用 SSH 配置', value: '' },
    ...sshProfiles.value.map((profile) => ({
      label: `${profile.label} (${profile.username}@${profile.host})`,
      value: profile.id,
    })),
  ]);

  function resetProfileForm() {
    editingProfileId.value = '';
    profileForm.label = '';
    profileForm.protocol = 'sftp';
    profileForm.host = '';
    profileForm.port = '22';
    profileForm.username = '';
    profileForm.authType = 'password';
    profileForm.savePassword = false;
    profileForm.password = '';
    profileForm.privateKeyPath = '';
    profileForm.certificatePath = '';
    profileForm.hostCaKeyPath = '';
    profileForm.privateKeyPassphrase = '';
    profileForm.sshProfileId = '';
    profileForm.folderId = '';
    profileForm.defaultRemotePath = '/';
    profileForm.defaultLocalPath = options.ftpStore.localPath || '';
    profileForm.maxConcurrent = '2';
  }

  function resetFolderForm() {
    editingFolderId.value = '';
    folderForm.label = '';
    folderForm.parentId = '';
  }

  function applySshProfile(id: string) {
    if (profileForm.protocol !== 'sftp') return;
    const profile = sshProfiles.value.find((item) => item.id === id);
    if (!profile) return;
    profileForm.host = profile.host;
    profileForm.port = String(profile.port);
    profileForm.username = profile.username;
    if (profile.authType === 'password' || profile.authType === 'privateKey') {
      profileForm.authType = profile.authType;
    } else if (profile.authType === 'keyboardInteractive') {
      profileForm.authType = profile.authType;
    }
    profileForm.savePassword = profile.savePassword;
    if (profile.privateKeyPath) {
      profileForm.privateKeyPath = profile.privateKeyPath;
    }
    if (profile.certificatePath) {
      profileForm.certificatePath = profile.certificatePath;
    }
    if (profile.hostCaKeyPath) {
      profileForm.hostCaKeyPath = profile.hostCaKeyPath;
    }
  }

  function openCreateDialog(folderId = '') {
    resetProfileForm();
    profileForm.folderId = folderId;
    profileDialogVisible.value = true;
  }

  function openCreateFolderDialog(parentId = '') {
    resetFolderForm();
    folderForm.parentId = parentId;
    folderDialogVisible.value = true;
  }

  function openEditDialog(profile: FtpProfile) {
    editingProfileId.value = profile.id;
    profileForm.label = profile.label;
    profileForm.protocol = profile.protocol;
    profileForm.host = profile.host;
    profileForm.port = String(profile.port);
    profileForm.username = profile.username;
    profileForm.authType = profile.authType;
    profileForm.savePassword = profile.savePassword;
    profileForm.password = '';
    profileForm.privateKeyPath = profile.privateKeyPath ?? '';
    profileForm.certificatePath = profile.certificatePath ?? '';
    profileForm.hostCaKeyPath = profile.hostCaKeyPath ?? '';
    profileForm.privateKeyPassphrase = '';
    profileForm.sshProfileId = profile.sshProfileId ?? '';
    profileForm.folderId = profile.folderId ?? '';
    profileForm.defaultRemotePath = profile.defaultRemotePath || '/';
    profileForm.defaultLocalPath = profile.defaultLocalPath || options.ftpStore.localPath || '';
    profileForm.maxConcurrent = String(profile.maxConcurrent || 2);
    profileDialogVisible.value = true;
  }

  function openEditFolderDialog(folder: FtpSessionFolder) {
    editingFolderId.value = folder.id;
    folderForm.label = folder.label;
    folderForm.parentId = folder.parentId ?? '';
    folderDialogVisible.value = true;
  }

  async function loadSshProfiles() {
    sshProfiles.value = await window.sshApi.listProfiles();
  }

  watch(() => profileForm.protocol, (nextProtocol, previousProtocol) => {
    if (nextProtocol === previousProtocol) return;
    if (nextProtocol !== 'sftp') {
      profileForm.authType = 'password';
      profileForm.privateKeyPath = '';
      profileForm.certificatePath = '';
      profileForm.hostCaKeyPath = '';
      profileForm.privateKeyPassphrase = '';
      profileForm.savePassword = Boolean(profileForm.savePassword);
      profileForm.port = '21';
      return;
    }

    if (profileForm.authType !== 'password' && profileForm.authType !== 'privateKey' && profileForm.authType !== 'keyboardInteractive') {
      profileForm.authType = 'password';
    }
    profileForm.port = '22';
  });

  async function initializePage() {
    options.busyMessage.value = '正在加载文件传输模块...';
    options.actionError.value = '';
    try {
      await Promise.all([
        options.ftpStore.initialize(),
        loadSshProfiles(),
      ]);
    } finally {
      options.busyMessage.value = '';
    }
  }

  async function saveProfile() {
    options.actionError.value = '';
    options.busyMessage.value = editingProfileId.value ? '正在更新配置...' : '正在创建配置...';
    try {
      const input = {
        label: profileForm.label.trim(),
        protocol: profileForm.protocol,
        host: profileForm.host.trim(),
        port: Number(profileForm.port) || 22,
        username: profileForm.username.trim(),
        authType: profileForm.authType,
        savePassword: profileForm.authType === 'keyboardInteractive' ? false : profileForm.savePassword,
        password: profileForm.authType === 'password' ? (profileForm.password || undefined) : undefined,
        privateKeyPath: profileForm.authType === 'privateKey' ? (profileForm.privateKeyPath || undefined) : undefined,
        certificatePath: profileForm.authType === 'privateKey' ? (profileForm.certificatePath || undefined) : undefined,
        hostCaKeyPath: profileForm.protocol === 'sftp' ? (profileForm.hostCaKeyPath || undefined) : undefined,
        privateKeyPassphrase: profileForm.authType === 'privateKey' ? (profileForm.privateKeyPassphrase || undefined) : undefined,
        sshProfileId: profileForm.sshProfileId || undefined,
        folderId: profileForm.folderId,
        defaultRemotePath: profileForm.defaultRemotePath || '/',
        defaultLocalPath: profileForm.defaultLocalPath || options.ftpStore.localPath || '',
        maxConcurrent: Number(profileForm.maxConcurrent) || 2,
      };

      if (!input.label) {
        throw new Error('请输入配置名称');
      }

      if (editingProfileId.value) {
        await options.ftpStore.updateProfile({ id: editingProfileId.value, ...input });
      } else {
        await options.ftpStore.createProfile(input);
      }

      profileDialogVisible.value = false;
    } catch (error) {
      setActionError(error, 'FTP 配置保存失败');
    } finally {
      options.busyMessage.value = '';
    }
  }

  async function saveFolder() {
    options.actionError.value = '';
    options.busyMessage.value = editingFolderId.value ? '正在更新文件夹...' : '正在创建文件夹...';
    try {
      const input = {
        label: folderForm.label.trim(),
        parentId: folderForm.parentId,
      };
      if (!input.label) {
        throw new Error('请输入文件夹名称');
      }

      if (editingFolderId.value) {
        await options.ftpStore.updateFolder({ id: editingFolderId.value, ...input });
      } else {
        await options.ftpStore.createFolder(input);
      }

      folderDialogVisible.value = false;
    } catch (error) {
      setActionError(error, 'FTP 文件夹保存失败');
    } finally {
      options.busyMessage.value = '';
    }
  }

  async function removeFolder(folder: FtpSessionFolder) {
    const confirmed = await options.showConfirm({
      title: '删除文件夹',
      message: `确认删除文件夹“${folder.label}”及其子文件夹吗？文件夹内会话将变为未分组。`,
      confirmText: '删除',
      danger: true,
    });
    if (!confirmed) return;
    options.actionError.value = '';
    options.busyMessage.value = '正在删除文件夹...';
    try {
      await options.ftpStore.deleteFolder(folder.id);
      await options.ftpStore.refreshProfiles();
    } catch (error) {
      setActionError(error, 'FTP 文件夹删除失败');
    } finally {
      options.busyMessage.value = '';
    }
  }

  async function removeProfile(profile: FtpProfile) {
    const confirmed = await options.showConfirm({
      title: '删除配置',
      message: `确认删除配置“${profile.label}”吗？`,
      confirmText: '删除',
      danger: true,
    });
    if (!confirmed) return;
    options.actionError.value = '';
    options.busyMessage.value = '正在删除配置...';
    try {
      await options.ftpStore.deleteProfile(profile.id);
    } catch (error) {
      setActionError(error, 'FTP 配置删除失败');
    } finally {
      options.busyMessage.value = '';
    }
  }

  function extractHostVerificationPayload(message: string) {
    const prefix = 'host_verification_required:';
    const index = message.indexOf(prefix);
    if (index === -1) return null;
    try {
      return JSON.parse(message.slice(index + prefix.length).trim()) as HostVerificationPayload;
    } catch {
      return null;
    }
  }

  function extractAuthChallenge(message: string) {
    const prefix = 'keyboard_interactive_required:';
    const index = message.indexOf(prefix);
    if (index === -1) return null;
    try {
      return JSON.parse(message.slice(index + prefix.length).trim()) as FtpAuthChallenge;
    } catch {
      return null;
    }
  }

  async function performConnect(
    profile: FtpProfile,
    password?: string,
    authSessionId?: string,
    challengeResponses?: string[],
  ) {
    await options.ftpStore.connect({
      profileId: profile.id,
      password,
      authSessionId,
      challengeResponses,
    });
  }

  async function connectProfile(
    profile: FtpProfile,
    password?: string,
    authSessionId?: string,
    challengeResponses?: string[],
  ) {
    options.actionError.value = '';
    options.busyMessage.value = `正在连接 ${profile.label}...`;
    try {
      await performConnect(profile, password, authSessionId, challengeResponses);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const hostVerification = extractHostVerificationPayload(message);
      const authChallenge = extractAuthChallenge(message);
      if (hostVerification) {
        const isMismatch = Boolean(hostVerification.storedFingerprint);
        const trusted = await options.showConfirm({
          title: isMismatch ? '主机密钥已变更' : '信任主机',
          message: isMismatch
            ? [
              `检测到 ${hostVerification.host}:${hostVerification.port} 的主机密钥与已信任记录不一致。`,
              `算法: ${hostVerification.algorithm}`,
              `当前指纹: ${hostVerification.fingerprint}`,
              `已存指纹: ${hostVerification.storedFingerprint}`,
              '',
              '这可能意味着服务器已重装、密钥轮换，或存在中间人攻击风险。仅在确认变更可信后再覆盖已信任指纹。',
            ].join('\n')
            : `首次连接 ${hostVerification.host}:${hostVerification.port}\n算法: ${hostVerification.algorithm}\n指纹: ${hostVerification.fingerprint}\n\n是否信任该主机？`,
          confirmText: isMismatch ? '覆盖信任' : '信任',
          danger: isMismatch,
        });
        if (!trusted) {
          throw new Error(isMismatch ? '检测到主机密钥变更，连接已取消' : '用户取消信任主机');
        }
        await window.sshApi.trustHost({
          host: hostVerification.host,
          port: hostVerification.port,
          algorithm: hostVerification.algorithm,
          fingerprint: hostVerification.fingerprint,
          trustMode: 'permanent',
        });
        await connectProfile(profile, password);
        return;
      } else if (authChallenge) {
        pendingAuthChallenge.value = authChallenge;
        authChallengeResponses.value = authChallenge.prompts.map(() => '');
        authChallengeDialogVisible.value = true;
        return;
      } else if (profile.authType === 'password' && !profile.savePassword && !password) {
        pendingConnectProfile.value = profile;
        connectPassword.value = '';
        passwordDialogVisible.value = true;
        return;
      } else {
        setActionError(error, 'FTP 连接失败');
      }
    } finally {
      options.busyMessage.value = '';
    }
  }

  async function submitPasswordConnect() {
    const profile = pendingConnectProfile.value;
    if (!profile) return;
    passwordDialogVisible.value = false;
    pendingConnectProfile.value = null;
    await connectProfile(profile, connectPassword.value || undefined);
  }

  function cancelPasswordPrompt() {
    passwordDialogVisible.value = false;
    pendingConnectProfile.value = null;
    connectPassword.value = '';
  }

  async function submitAuthChallenge() {
    const challenge = pendingAuthChallenge.value;
    if (!challenge) return;
    const profile = options.ftpStore.profiles.find((item) => item.id === challenge.profileId);
    if (!profile) {
      throw new Error('认证对应的 FTP 配置不存在');
    }
    authChallengeDialogVisible.value = false;
    pendingAuthChallenge.value = null;
    await connectProfile(profile, undefined, challenge.authSessionId, [...authChallengeResponses.value]);
  }

  async function cancelAuthChallenge() {
    const challenge = pendingAuthChallenge.value;
    authChallengeDialogVisible.value = false;
    pendingAuthChallenge.value = null;
    authChallengeResponses.value = [];
    if (challenge?.authSessionId) {
      await window.ftpApi.cancelAuthChallenge(challenge.authSessionId);
    }
  }

  function requestEntryName(optionsForDialog: EntryNameDialogOptions) {
    resolveEntryNameDialog?.(null);
    resolveEntryNameDialog = null;

    entryNameDialogTitle.value = optionsForDialog.title;
    entryNameDialogLabel.value = optionsForDialog.label;
    entryNameDialogConfirmText.value = optionsForDialog.confirmText || '确定';
    entryNameDialogValue.value = optionsForDialog.initialValue || '';
    entryNameDialogPlaceholder.value = optionsForDialog.placeholder || '';
    entryNameDialogVisible.value = true;

    return new Promise<string | null>((resolve) => {
      resolveEntryNameDialog = resolve;
    });
  }

  function finishEntryNameDialog(result: string | null) {
    entryNameDialogVisible.value = false;
    const nextValue = typeof result === 'string' ? result.trim() : null;
    resolveEntryNameDialog?.(nextValue ? nextValue : null);
    resolveEntryNameDialog = null;
  }

  function submitEntryNameDialog() {
    const value = entryNameDialogValue.value.trim();
    if (!value) return;
    finishEntryNameDialog(value);
  }

  function cancelEntryNameDialog() {
    finishEntryNameDialog(null);
  }

  return {
    sshProfiles,
    profileDialogVisible,
    folderDialogVisible,
    passwordDialogVisible,
    authChallengeDialogVisible,
    entryNameDialogVisible,
    editingProfileId,
    editingFolderId,
    pendingConnectProfile,
    pendingAuthChallenge,
    connectPassword,
    authChallengeResponses,
    entryNameDialogTitle,
    entryNameDialogLabel,
    entryNameDialogConfirmText,
    entryNameDialogValue,
    entryNameDialogPlaceholder,
    profileForm,
    folderForm,
    protocolOptions,
    authTypeOptions,
    sshProfileEnabled,
    sshProfileLabel,
    sshProfileOptions,
    applySshProfile,
    openCreateDialog,
    openCreateFolderDialog,
    openEditDialog,
    openEditFolderDialog,
    initializePage,
    saveProfile,
    saveFolder,
    removeFolder,
    removeProfile,
    connectProfile,
    submitPasswordConnect,
    cancelPasswordPrompt,
    submitAuthChallenge,
    cancelAuthChallenge,
    requestEntryName,
    submitEntryNameDialog,
    cancelEntryNameDialog,
  };
}
