<script setup lang="ts">
import UiButton from '@/windows/main/components/ui/UiButton.vue';
import UiCheckbox from '@/windows/main/components/ui/UiCheckbox.vue';
import UiDialog from '@/windows/main/components/ui/UiDialog.vue';
import UiField from '@/windows/main/components/ui/UiField.vue';
import UiInput from '@/windows/main/components/ui/UiInput.vue';
import UiSelect from '@/windows/main/components/ui/UiSelect.vue';
import type { FtpProfileFormState } from '../../types';

defineProps<{
  modelValue: boolean;
  title: string;
  form: FtpProfileFormState;
  protocolOptions: Array<{ label: string; value: string }>;
  sshProfileOptions: Array<{ label: string; value: string }>;
  folderSelectOptions: Array<{ label: string; value: string }>;
  authTypeOptions: Array<{ label: string; value: string }>;
  sshProfileEnabled: boolean;
  sshProfileLabel: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  'apply-ssh-profile': [id: string];
  save: [];
}>();
</script>

<template>
  <UiDialog :model-value="modelValue" width="720" max-width="92vw" @update:modelValue="emit('update:modelValue', $event)">
    <template #header>
      <div class="ftp-dialog__header">{{ title }}</div>
    </template>
    <div class="ftp-dialog__body">
      <div class="ftp-dialog__grid">
        <UiField label="名称" required>
          <UiInput v-model="form.label" placeholder="例如：生产服务器文件" />
        </UiField>
        <UiField label="协议">
          <UiSelect v-model="form.protocol" :options="protocolOptions" />
        </UiField>
        <UiField v-if="sshProfileEnabled" :label="sshProfileLabel">
          <UiSelect v-model="form.sshProfileId" :options="sshProfileOptions" @change="emit('apply-ssh-profile', String($event))" />
        </UiField>
        <UiField v-if="form.protocol !== 'sftp'" label="隧道说明">
          <UiInput model-value="所选 SSH 配置仅用作 FTP/FTPS 到目标主机的隧道，不会覆盖当前 FTP 主机和用户名" disabled />
        </UiField>
        <UiField label="所属文件夹">
          <UiSelect v-model="form.folderId" :options="folderSelectOptions" />
        </UiField>
        <UiField label="认证方式">
          <UiSelect v-model="form.authType" :options="authTypeOptions" />
        </UiField>
        <UiField label="主机" required>
          <UiInput v-model="form.host" placeholder="example.com" />
        </UiField>
        <UiField label="端口">
          <UiInput v-model="form.port" type="number" :min="1" :max="65535" />
        </UiField>
        <UiField label="用户名" required>
          <UiInput v-model="form.username" placeholder="root" />
        </UiField>
        <UiField label="最大并发">
          <UiInput v-model="form.maxConcurrent" type="number" :min="1" :max="8" />
        </UiField>
        <UiField v-if="form.authType === 'password'" label="密码">
          <UiInput v-model="form.password" type="password" placeholder="留空表示连接时输入" />
        </UiField>
        <UiField v-if="form.authType === 'privateKey'" label="私钥路径">
          <UiInput v-model="form.privateKeyPath" placeholder="C:\Users\me\.ssh\id_ed25519" />
        </UiField>
        <UiField v-if="form.authType === 'privateKey'" label="OpenSSH 证书路径">
          <UiInput v-model="form.certificatePath" placeholder="C:\Users\me\.ssh\id_ed25519-cert.pub" />
        </UiField>
        <UiField v-if="form.protocol === 'sftp'" label="主机 CA 公钥路径">
          <UiInput v-model="form.hostCaKeyPath" placeholder="C:\Users\me\.ssh\ssh_host_ca.pub" />
        </UiField>
        <UiField v-if="form.authType === 'privateKey'" label="私钥口令">
          <UiInput v-model="form.privateKeyPassphrase" type="password" placeholder="可选" />
        </UiField>
        <UiField v-if="form.authType === 'keyboardInteractive'" label="认证说明">
          <UiInput model-value="连接时将根据服务器提示逐项输入认证信息" disabled />
        </UiField>
        <UiField label="默认远程路径">
          <UiInput v-model="form.defaultRemotePath" placeholder="/" />
        </UiField>
        <UiField label="默认本地路径">
          <UiInput v-model="form.defaultLocalPath" placeholder="留空使用默认下载目录" />
        </UiField>
      </div>
      <UiCheckbox v-if="form.authType !== 'keyboardInteractive'" v-model="form.savePassword">
        保存凭据到本地加密存储
      </UiCheckbox>
    </div>
    <template #footer>
      <div class="ftp-dialog__footer">
        <UiButton variant="ghost" @click="emit('update:modelValue', false)">取消</UiButton>
        <UiButton variant="primary" @click="emit('save')">保存</UiButton>
      </div>
    </template>
  </UiDialog>
</template>
