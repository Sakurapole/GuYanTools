<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{
  profileId?: string;
  command?: string;
  label?: string;
  size?: number;
}>(), {
  profileId: '',
  command: '',
  label: '',
  size: 16,
});

type ProfileIconKind = 'cmd' | 'powershell' | 'pwsh' | 'bash' | 'zsh' | 'sh' | 'terminal';

const normalizedProfileText = computed(() =>
  `${props.profileId} ${props.command} ${props.label}`.toLowerCase(),
);

const iconKind = computed<ProfileIconKind>(() => {
  const text = normalizedProfileText.value;

  if (text.includes('cmd') || text.includes('command prompt')) {
    return 'cmd';
  }
  if (text.includes('pwsh')) {
    return 'pwsh';
  }
  if (text.includes('powershell')) {
    return 'powershell';
  }
  if (text.includes('bash')) {
    return 'bash';
  }
  if (text.includes('zsh')) {
    return 'zsh';
  }
  if (/\bsh\b/.test(text)) {
    return 'sh';
  }

  return 'terminal';
});

const iconMark = computed(() => {
  switch (iconKind.value) {
    case 'cmd':
      return 'C:';
    case 'powershell':
    case 'pwsh':
      return 'PS';
    case 'bash':
      return '$';
    case 'zsh':
      return '%';
    case 'sh':
      return '#';
    default:
      return '>';
  }
});

const iconLabel = computed(() => {
  switch (iconKind.value) {
    case 'cmd':
      return 'Command Prompt';
    case 'powershell':
      return 'Windows PowerShell';
    case 'pwsh':
      return 'PowerShell';
    case 'bash':
      return 'Bash';
    case 'zsh':
      return 'Zsh';
    case 'sh':
      return 'Shell';
    default:
      return 'Terminal';
  }
});

const iconStyle = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
}));
</script>

<template>
  <span
    class="terminal-profile-icon"
    :class="`terminal-profile-icon--${iconKind}`"
    :style="iconStyle"
    :title="iconLabel"
    aria-hidden="true"
  >
    <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect class="terminal-profile-icon__bg" x="2.75" y="4.25" width="18.5" height="15.5" rx="3" />
      <path class="terminal-profile-icon__prompt" d="M6.75 9.25 9.75 12l-3 2.75" />
      <path class="terminal-profile-icon__cursor" d="M11.25 15.25h5.25" />
      <text
        class="terminal-profile-icon__mark"
        x="15.4"
        y="11.1"
        text-anchor="middle"
        dominant-baseline="middle"
      >{{ iconMark }}</text>
    </svg>
  </span>
</template>

<style lang="scss" scoped>
.terminal-profile-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  color: var(--ui-text-muted);
}

.terminal-profile-icon--cmd {
  color: #6b7280;
}

.terminal-profile-icon--powershell {
  color: #2563eb;
}

.terminal-profile-icon--pwsh {
  color: #0ea5e9;
}

.terminal-profile-icon--bash {
  color: #16a34a;
}

.terminal-profile-icon--zsh {
  color: #8b5cf6;
}

.terminal-profile-icon--sh {
  color: #d97706;
}

.terminal-profile-icon--terminal {
  color: var(--primary-color);
}

.terminal-profile-icon__bg {
  fill: currentColor;
  fill-opacity: 0.13;
  stroke: currentColor;
  stroke-opacity: 0.84;
  stroke-width: 1.5;
}

.terminal-profile-icon__prompt,
.terminal-profile-icon__cursor {
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.terminal-profile-icon__mark {
  fill: currentColor;
  font-family: Consolas, 'Cascadia Mono', monospace;
  font-size: 5.5px;
  font-weight: 700;
  letter-spacing: 0;
}
</style>
