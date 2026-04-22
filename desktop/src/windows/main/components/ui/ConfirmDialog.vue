<script setup lang="ts">
import { useConfirmDialog } from '@/windows/main/composables/useConfirmDialog';
import UiDialog from './UiDialog.vue';

const { visible, options, confirm, cancel } = useConfirmDialog();
</script>

<template>
  <UiDialog :modelValue="visible" @update:modelValue="cancel" :width="400" :close-on-mask="false">
    <template #header>
      <div class="confirm-header">
        <span class="confirm-icon" :class="{ 'confirm-icon--danger': options.danger }">
          <svg v-if="options.danger" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
            <line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/>
          </svg>
          <svg v-else width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>
          </svg>
        </span>
        <span class="confirm-title">{{ options.title }}</span>
      </div>
    </template>

    <div class="confirm-body">
      <p class="confirm-message">{{ options.message }}</p>
    </div>

    <template #footer>
      <div class="confirm-footer">
        <button class="confirm-btn confirm-btn--cancel" @click="cancel">
          {{ options.cancelText }}
        </button>
        <button 
          class="confirm-btn confirm-btn--confirm"
          :class="{ 'confirm-btn--danger': options.danger }"
          @click="confirm"
        >
          {{ options.confirmText }}
        </button>
      </div>
    </template>
  </UiDialog>
</template>

<style scoped>
.confirm-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 20px;
}

.confirm-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--ui-tabs-active-bg);
  color: var(--ui-input-focus-border);
  flex-shrink: 0;
}

.confirm-icon--danger {
  background: rgba(220, 59, 1, 0.1);
  color: var(--ui-button-danger-text, #D83B01);
}

.confirm-title {
  font-size: 1.05em;
  font-weight: 600;
  color: var(--ui-text-primary);
}

.confirm-body {
  padding: 8px 20px 16px;
}

.confirm-message {
  margin: 0;
  font-size: 0.92em;
  line-height: 1.6;
  color: var(--ui-text-muted);
}

.confirm-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 20px;
}

.confirm-btn {
  padding: 8px 20px;
  border-radius: var(--ui-radius-sm, 8px);
  font-size: 0.88em;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: all 0.18s ease;
}

.confirm-btn--cancel {
  background: transparent;
  border: 1px solid var(--ui-border-subtle);
  color: var(--ui-text-muted);
}
.confirm-btn--cancel:hover {
  background: var(--ui-button-ghost-hover-bg);
  border-color: var(--ui-border-accent-soft);
}

.confirm-btn--confirm {
  background: var(--ui-input-focus-border);
  color: white;
  box-shadow: 0 2px 8px rgba(74, 144, 217, 0.25);
}
.confirm-btn--confirm:hover {
  filter: brightness(1.08);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(74, 144, 217, 0.35);
}
.confirm-btn--confirm:active {
  transform: translateY(0);
}

.confirm-btn--danger {
  background: var(--ui-button-danger-text, #D83B01);
  box-shadow: 0 2px 8px rgba(220, 59, 1, 0.25);
}
.confirm-btn--danger:hover {
  box-shadow: 0 4px 12px rgba(220, 59, 1, 0.35);
}
</style>
