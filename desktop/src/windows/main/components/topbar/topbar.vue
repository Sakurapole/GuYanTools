<script setup lang="ts">
import SvgIcon from '@/windows/main/components/svgs/svgicon.vue';
import { useTheme } from '@/windows/main/composables/theme';
import { getErrorMessage, notifyError, notifyWarning } from '@/windows/main/composables/useInAppNotification';
import { useGlobalStore } from '@/windows/main/stores/global_store';
import { useHomeProfileStore } from '@/windows/main/stores/home_profile_store';
import { computed, nextTick, onMounted, onUnmounted, ref, watch, type CSSProperties } from 'vue';
import { useRoute } from 'vue-router';
import { storeToRefs } from 'pinia';
import Spacer from '../Spacer.vue';
import UiButton from '../ui/UiButton.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiInput from '../ui/UiInput.vue';

const { ipcRenderer } = window;
const globalStore = useGlobalStore();
const homeProfileStore = useHomeProfileStore();
const route = useRoute();
const { currentPage, topbarColor } = storeToRefs(globalStore);
const { theme, toggleTheme } = useTheme();
const profileSwitcherRef = ref<HTMLElement | null>(null);
const profilePanelSurfaceRef = ref<HTMLElement | null>(null);
const profilePanelOpen = ref(false);
const profileRowsTransitionEnabled = ref(false);
const createProfileName = ref('');
const editingProfileKey = ref('');
const editingProfileName = ref('');
const profilePanelError = ref('');
const profilePanelStyle = ref<CSSProperties>({});
let profileRowsTransitionTimer: number | undefined;

const topbarStyle = computed(() => {
  if (!topbarColor.value) return {};
  return {
    '--topbar-bg-color': topbarColor.value,
  };
});

const activeProfileName = computed(() => homeProfileStore.activeProfile?.name ?? 'Default Workspace');
const profileButtonLabel = computed(() => `配置文件：${activeProfileName.value}`);
const isProfileBusy = computed(() => homeProfileStore.loading || homeProfileStore.switching);
const showHomeProfileSwitcher = computed(() => route.path === '/home');

function setProfilePanelError(error: unknown, title: string) {
  profilePanelError.value = getErrorMessage(error);
  notifyError(error, title);
}

function openProfilePanel() {
  profilePanelError.value = '';
  profileRowsTransitionEnabled.value = false;
  window.clearTimeout(profileRowsTransitionTimer);
  updateProfilePanelPosition();
  profilePanelOpen.value = true;
  profileRowsTransitionTimer = window.setTimeout(() => {
    profileRowsTransitionEnabled.value = true;
  }, 200);
  if (homeProfileStore.profiles.length === 0 && !homeProfileStore.loading) {
    void homeProfileStore.loadProfiles().catch(error => {
      setProfilePanelError(error, '首页配置文件加载失败');
    });
  }
}

function toggleProfilePanel() {
  if (profilePanelOpen.value) {
    profilePanelOpen.value = false;
    return;
  }
  openProfilePanel();
}

function closeProfilePanel() {
  profilePanelOpen.value = false;
  profileRowsTransitionEnabled.value = false;
  window.clearTimeout(profileRowsTransitionTimer);
  editingProfileKey.value = '';
  editingProfileName.value = '';
}

function handleDocumentPointerDown(event: PointerEvent) {
  if (!profilePanelOpen.value) {
    return;
  }

  const target = event.target as Node | null;
  if (
    target
    && (profileSwitcherRef.value?.contains(target) || profilePanelSurfaceRef.value?.contains(target))
  ) {
    return;
  }

  closeProfilePanel();
}

function handleWindowKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && profilePanelOpen.value) {
    closeProfilePanel();
  }
}

async function switchProfile(key: string) {
  profilePanelError.value = '';
  try {
    await homeProfileStore.switchProfile(key);
  } catch (error) {
    setProfilePanelError(error, '首页配置文件切换失败');
  }
}

async function createProfile() {
  const name = createProfileName.value.trim();
  if (!name) {
    return;
  }

  profilePanelError.value = '';
  try {
    await homeProfileStore.createProfile(name);
    createProfileName.value = '';
  } catch (error) {
    setProfilePanelError(error, '首页配置文件创建失败');
  }
}

function startRenameProfile(key: string, name: string) {
  editingProfileKey.value = key;
  editingProfileName.value = name;
  profilePanelError.value = '';
}

async function confirmRenameProfile() {
  const key = editingProfileKey.value;
  const name = editingProfileName.value.trim();
  if (!key || !name) {
    return;
  }

  profilePanelError.value = '';
  try {
    await homeProfileStore.renameProfile(key, name);
    editingProfileKey.value = '';
    editingProfileName.value = '';
  } catch (error) {
    setProfilePanelError(error, '首页配置文件重命名失败');
  }
}

async function deleteProfile(key: string) {
  if (homeProfileStore.profiles.length <= 1) {
    profilePanelError.value = '至少保留一个配置文件。';
    notifyWarning(profilePanelError.value, '无法删除配置文件');
    return;
  }

  profilePanelError.value = '';
  try {
    await homeProfileStore.deleteProfile(key);
    if (editingProfileKey.value === key) {
      editingProfileKey.value = '';
      editingProfileName.value = '';
    }
  } catch (error) {
    setProfilePanelError(error, '首页配置文件删除失败');
  }
}

function updateProfilePanelPosition() {
  const trigger = profileSwitcherRef.value;
  if (!trigger) {
    return;
  }

  const rect = trigger.getBoundingClientRect();
  const panelWidth = 360;
  const viewportPadding = 12;
  const left = Math.min(
    Math.max(viewportPadding, rect.left),
    Math.max(viewportPadding, window.innerWidth - panelWidth - viewportPadding),
  );

  profilePanelStyle.value = {
    left: `${left}px`,
    top: `${rect.bottom}px`,
    width: `${Math.min(panelWidth, window.innerWidth - viewportPadding * 2)}px`,
  };
}

onMounted(() => {
  window.addEventListener('pointerdown', handleDocumentPointerDown, true);
  window.addEventListener('keydown', handleWindowKeydown);
  window.addEventListener('resize', updateProfilePanelPosition);
});

onUnmounted(() => {
  window.removeEventListener('pointerdown', handleDocumentPointerDown, true);
  window.removeEventListener('keydown', handleWindowKeydown);
  window.removeEventListener('resize', updateProfilePanelPosition);
  window.clearTimeout(profileRowsTransitionTimer);
});

watch(profilePanelOpen, (open) => {
  if (open) {
    void nextTick(updateProfilePanelPosition);
  }
});

watch(showHomeProfileSwitcher, (visible) => {
  if (!visible) {
    closeProfilePanel();
    return;
  }

  if (homeProfileStore.profiles.length === 0 && !homeProfileStore.loading) {
    void homeProfileStore.loadProfiles().catch(error => {
      setProfilePanelError(error, '首页配置文件加载失败');
    });
  }
}, { immediate: true });
</script>

<template>
  <div id="topbar-container" :style="topbarStyle">
    <div class="window-title-container">
      <div class="window-title">
        GuYanTools
      </div>
      <Spacer :size="6" direction="horizontal" type="divider" />
      <div class="window-subtitle">
        {{ currentPage }}
      </div>
    </div>
    <div class="application-func-container" aria-label="应用功能区">
      <div v-if="showHomeProfileSwitcher" ref="profileSwitcherRef" class="home-profile-switcher">
        <UiButton
          class="home-profile-switcher__trigger"
          variant="ghost"
          :class="{ active: profilePanelOpen }"
          :title="profileButtonLabel"
          type="button"
          @click="toggleProfilePanel"
        >
          <span class="home-profile-switcher__dot" />
          <span class="home-profile-switcher__label">{{ activeProfileName }}</span>
          <span class="home-profile-switcher__chevron" :class="{ open: profilePanelOpen }">
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
              <path
                d="M3 4.5L6 7.5L9 4.5"
                fill="none"
                stroke="currentColor"
                stroke-width="1.4"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </span>
        </UiButton>
      </div>
      <Teleport v-if="showHomeProfileSwitcher" to="body">
        <div
          v-if="profilePanelOpen"
          class="home-profile-panel-backdrop"
          aria-hidden="true"
          @pointerdown="closeProfilePanel"
        />
        <Transition name="home-profile-panel">
          <div
            v-if="profilePanelOpen"
            ref="profilePanelSurfaceRef"
            class="home-profile-panel"
            :style="profilePanelStyle"
            role="menu"
          >
            <div class="home-profile-panel__header">
              <div>
                <div class="home-profile-panel__eyebrow">首页配置文件</div>
                <div class="home-profile-panel__current">{{ activeProfileName }}</div>
              </div>
              <span v-if="isProfileBusy" class="home-profile-panel__status">同步中</span>
            </div>

            <TransitionGroup
              class="home-profile-panel__list"
              name="home-profile-row"
              tag="div"
              :css="profileRowsTransitionEnabled"
            >
              <div
                v-for="profile in homeProfileStore.profiles"
                :key="profile.key"
                class="home-profile-row"
                :class="{ active: profile.key === homeProfileStore.activeProfileKey }"
              >
                <template v-if="editingProfileKey === profile.key">
                  <UiInput
                    v-model="editingProfileName"
                    class="home-profile-row__input"
                    size="sm"
                    placeholder="配置文件名称"
                    @keydown.enter="confirmRenameProfile"
                  />
                  <UiButton size="sm" variant="primary" :disabled="!editingProfileName.trim()" @click="confirmRenameProfile">保存</UiButton>
                  <UiButton size="sm" variant="ghost" @click="editingProfileKey = ''">取消</UiButton>
              </template>
              <template v-else>
                <UiButton class="home-profile-row__main" variant="ghost" type="button" @click="switchProfile(profile.key)">
                    <span
                      class="home-profile-row__check"
                      :class="{ active: profile.key === homeProfileStore.activeProfileKey }"
                      aria-hidden="true"
                    >
                      <svg viewBox="0 0 16 16" focusable="false">
                        <path
                          d="M3.5 8.2L6.4 11L12.5 5"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="1.8"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        />
                      </svg>
                  </span>
                  <span class="home-profile-row__name">{{ profile.name }}</span>
                  <span v-if="profile.isDefault" class="home-profile-row__badge">默认</span>
                </UiButton>
                  <UiIconButton
                    class="home-profile-row__action"
                    size="sm"
                    variant="ghost"
                    shape="square"
                    title="重命名"
                    @click="startRenameProfile(profile.key, profile.name)"
                  >
                    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                      <path
                        d="M9.9 3.1L12.9 6.1M2.75 13.25L5.95 12.55L12.35 6.15C13.15 5.35 13.15 4.15 12.35 3.35L12.1 3.1C11.3 2.3 10.1 2.3 9.3 3.1L2.9 9.5L2.75 13.25Z"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.4"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      />
                    </svg>
                  </UiIconButton>
                  <UiIconButton
                    class="home-profile-row__action danger"
                    size="sm"
                    variant="danger"
                    shape="square"
                    :disabled="homeProfileStore.profiles.length <= 1"
                    :title="homeProfileStore.profiles.length <= 1 ? '至少保留一个配置文件' : '删除'"
                    @click="deleteProfile(profile.key)"
                  >
                    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                      <path
                        d="M3 4.25H13M6.25 4.25V3.2C6.25 2.75 6.6 2.4 7.05 2.4H8.95C9.4 2.4 9.75 2.75 9.75 3.2V4.25M5 6.1L5.35 12.45C5.4 13.15 5.9 13.6 6.6 13.6H9.4C10.1 13.6 10.6 13.15 10.65 12.45L11 6.1M7 7.25V11.35M9 7.25V11.35"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.35"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      />
                    </svg>
                  </UiIconButton>
                </template>
              </div>
            </TransitionGroup>

            <div class="home-profile-panel__create">
              <UiInput
                v-model="createProfileName"
                size="sm"
                placeholder="新配置文件名称"
                @keydown.enter="createProfile"
              />
              <UiButton size="sm" variant="primary" :disabled="!createProfileName.trim() || isProfileBusy" @click="createProfile">新建</UiButton>
            </div>

            <div v-if="profilePanelError || homeProfileStore.error" class="home-profile-panel__error">
              {{ profilePanelError || homeProfileStore.error }}
            </div>
          </div>
        </Transition>
      </Teleport>
    </div>
    <div class="drag-area"></div>
    <div class="window-btn-group">
      <UiIconButton class="theme-btn" variant="ghost" size="lg" shape="circle" title="切换主题" @click="toggleTheme">
        <SvgIcon width="24" height="24" color="var(--primary-color)" v-if="theme === 'light'" viewBox="0 0 1024 1024">
          <path
            d="M512 768c-140.8 0-256-115.2-256-256s115.2-256 256-256 256 115.2 256 256-115.2 256-256 256z m0-426.666667c-93.866667 0-170.666667 76.8-170.666667 170.666667s76.8 170.666667 170.666667 170.666667 170.666667-76.8 170.666667-170.666667-76.8-170.666667-170.666667-170.666667zM512 170.666667c-25.6 0-42.666667-17.066667-42.666667-42.666667V42.666667c0-25.6 17.066667-42.666667 42.666667-42.666667s42.666667 17.066667 42.666667 42.666667v85.333333c0 25.6-17.066667 42.666667-42.666667 42.666667zM512 1024c-25.6 0-42.666667-17.066667-42.666667-42.666667v-85.333333c0-25.6 17.066667-42.666667 42.666667-42.666667s42.666667 17.066667 42.666667 42.666667v85.333333c0 25.6-17.066667 42.666667-42.666667 42.666667zM238.933333 281.6c-12.8 0-21.333333-4.266667-29.866666-12.8L149.333333 209.066667c-17.066667-17.066667-17.066667-42.666667 0-59.733334s42.666667-17.066667 59.733334 0l59.733333 59.733334c17.066667 17.066667 17.066667 42.666667 0 59.733333-4.266667 8.533333-17.066667 12.8-29.866667 12.8zM844.8 887.466667c-12.8 0-21.333333-4.266667-29.866667-12.8l-59.733333-59.733334c-17.066667-17.066667-17.066667-42.666667 0-59.733333s42.666667-17.066667 59.733333 0l59.733334 59.733333c17.066667 17.066667 17.066667 42.666667 0 59.733334-8.533333 8.533333-21.333333 12.8-29.866667 12.8zM128 554.666667H42.666667c-25.6 0-42.666667-17.066667-42.666667-42.666667s17.066667-42.666667 42.666667-42.666667h85.333333c25.6 0 42.666667 17.066667 42.666667 42.666667s-17.066667 42.666667-42.666667 42.666667zM981.333333 554.666667h-85.333333c-25.6 0-42.666667-17.066667-42.666667-42.666667s17.066667-42.666667 42.666667-42.666667h85.333333c25.6 0 42.666667 17.066667 42.666667 42.666667s-17.066667 42.666667-42.666667 42.666667zM179.2 887.466667c-12.8 0-21.333333-4.266667-29.866667-12.8-17.066667-17.066667-17.066667-42.666667 0-59.733334l59.733334-59.733333c17.066667-17.066667 42.666667-17.066667 59.733333 0s17.066667 42.666667 0 59.733333l-59.733333 59.733334c-8.533333 8.533333-17.066667 12.8-29.866667 12.8zM785.066667 281.6c-12.8 0-21.333333-4.266667-29.866667-12.8-17.066667-17.066667-17.066667-42.666667 0-59.733333l59.733333-59.733334c17.066667-17.066667 42.666667-17.066667 59.733334 0s17.066667 42.666667 0 59.733334l-59.733334 59.733333c-8.533333 8.533333-21.333333 12.8-29.866666 12.8z"
            p-id="7165"></path>
        </SvgIcon>
        <SvgIcon width="24" height="24" color="var(--primary-color)" v-else viewBox="0 0 1024 1024">
          <path
            d="M444.224 177.408A341.44 341.44 0 0 0 512 853.376a341.248 341.248 0 0 0 295.68-170.688 384 384 0 0 1-380.992-384c0-41.792 5.568-82.624 17.536-121.28zM85.312 512A426.688 426.688 0 0 1 512 85.312h73.984l-37.056 64.064C524.224 192.064 512 242.688 512 298.688a298.688 298.688 0 0 0 356.16 293.12l71.808-13.952-23.168 69.376A426.688 426.688 0 0 1 85.376 512z"
            p-id="8138"></path>
        </SvgIcon>
      </UiIconButton>
      <UiIconButton class="mini-btn" variant="ghost" size="lg" shape="square" title="最小化"
        @click="ipcRenderer.send('main-renderer-minimize')">
        <SvgIcon width="28" height="28" color="var(--primary-color)" viewBox="0 0 640 640">
          <path
            d="M96 320C96 302.3 110.3 288 128 288L512 288C529.7 288 544 302.3 544 320C544 337.7 529.7 352 512 352L128 352C110.3 352 96 337.7 96 320z" />
        </SvgIcon>
      </UiIconButton>
      <UiIconButton class="max-btn" variant="ghost" size="lg" shape="square" title="最大化"
        @click="ipcRenderer.send('main-renderer-maximize')">
        <SvgIcon width="26" height="26" color="var(--primary-color)" viewBox="0 0 640 640">
          <path
            d="M128 96C110.3 96 96 110.3 96 128L96 224C96 241.7 110.3 256 128 256C145.7 256 160 241.7 160 224L160 160L224 160C241.7 160 256 145.7 256 128C256 110.3 241.7 96 224 96L128 96zM160 416C160 398.3 145.7 384 128 384C110.3 384 96 398.3 96 416L96 512C96 529.7 110.3 544 128 544L224 544C241.7 544 256 529.7 256 512C256 494.3 241.7 480 224 480L160 480L160 416zM416 96C398.3 96 384 110.3 384 128C384 145.7 398.3 160 416 160L480 160L480 224C480 241.7 494.3 256 512 256C529.7 256 544 241.7 544 224L544 128C544 110.3 529.7 96 512 96L416 96zM544 416C544 398.3 529.7 384 512 384C494.3 384 480 398.3 480 416L480 480L416 480C398.3 480 384 494.3 384 512C384 529.7 398.3 544 416 544L512 544C529.7 544 544 529.7 544 512L544 416z" />
        </SvgIcon>
      </UiIconButton>
      <UiIconButton class="close-btn" variant="danger" size="lg" shape="square" title="关闭"
        @click="ipcRenderer.send('main-renderer-close')">
        <SvgIcon width="28" height="28" color="var(--primary-color)" viewBox="0 0 640 640">
          <path
            d="M183.1 137.4C170.6 124.9 150.3 124.9 137.8 137.4C125.3 149.9 125.3 170.2 137.8 182.7L275.2 320L137.9 457.4C125.4 469.9 125.4 490.2 137.9 502.7C150.4 515.2 170.7 515.2 183.2 502.7L320.5 365.3L457.9 502.6C470.4 515.1 490.7 515.1 503.2 502.6C515.7 490.1 515.7 469.8 503.2 457.3L365.8 320L503.1 182.6C515.6 170.1 515.6 149.8 503.1 137.3C490.6 124.8 470.3 124.8 457.8 137.3L320.5 274.7L183.1 137.4z" />
        </SvgIcon>
      </UiIconButton>
    </div>
  </div>
</template>

<style lang="scss">
@use './topbar.scss';
</style>
