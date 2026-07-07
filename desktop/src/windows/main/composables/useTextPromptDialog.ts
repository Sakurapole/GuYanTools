import { reactive, ref } from 'vue';

export interface TextPromptDialogOptions {
  title?: string;
  label?: string;
  initialValue?: string;
  placeholder?: string;
  confirmText?: string;
  cancelText?: string;
  icon?: string;
  hint?: string;
  requiredMessage?: string;
  inputType?: string;
}

const visible = ref(false);
const value = ref('');
const options = reactive<Required<TextPromptDialogOptions>>({
  title: '输入内容',
  label: '内容',
  initialValue: '',
  placeholder: '',
  confirmText: '确定',
  cancelText: '取消',
  icon: 'iconify:lucide:pencil-line',
  hint: '',
  requiredMessage: '请输入内容',
  inputType: 'text',
});

let resolvePromise: ((value: string | null) => void) | null = null;

function show(input: TextPromptDialogOptions) {
  if (resolvePromise) {
    resolvePromise(null);
    resolvePromise = null;
  }

  Object.assign(options, {
    title: input.title ?? '输入内容',
    label: input.label ?? '内容',
    initialValue: input.initialValue ?? '',
    placeholder: input.placeholder ?? input.initialValue ?? '',
    confirmText: input.confirmText ?? '确定',
    cancelText: input.cancelText ?? '取消',
    icon: input.icon ?? 'iconify:lucide:pencil-line',
    hint: input.hint ?? '',
    requiredMessage: input.requiredMessage ?? '请输入内容',
    inputType: input.inputType ?? 'text',
  });
  value.value = options.initialValue;
  visible.value = true;

  return new Promise<string | null>((resolve) => {
    resolvePromise = resolve;
  });
}

function confirm() {
  const normalizedValue = value.value.trim();
  if (!normalizedValue) return;

  visible.value = false;
  resolvePromise?.(normalizedValue);
  resolvePromise = null;
}

function cancel() {
  visible.value = false;
  resolvePromise?.(null);
  resolvePromise = null;
}

export function useTextPromptDialog() {
  return {
    visible,
    value,
    options,
    show,
    confirm,
    cancel,
  };
}
