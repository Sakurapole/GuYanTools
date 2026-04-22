import { ref, reactive } from 'vue';

export interface ConfirmDialogOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

// ─── 全局单例状态 ───
const visible = ref(false);
const options = reactive<ConfirmDialogOptions>({
  title: '',
  message: '',
  confirmText: '确定',
  cancelText: '取消',
  danger: false,
});

let resolvePromise: ((value: boolean) => void) | null = null;

/**
 * 显示确认对话框，返回 Promise<boolean>
 */
function show(opts: ConfirmDialogOptions): Promise<boolean> {
  Object.assign(options, {
    title: opts.title || '提示',
    message: opts.message,
    confirmText: opts.confirmText || '确定',
    cancelText: opts.cancelText || '取消',
    danger: opts.danger ?? false,
  });
  visible.value = true;

  return new Promise((resolve) => {
    resolvePromise = resolve;
  });
}

function confirm() {
  visible.value = false;
  resolvePromise?.(true);
  resolvePromise = null;
}

function cancel() {
  visible.value = false;
  resolvePromise?.(false);
  resolvePromise = null;
}

/**
 * 全局确认对话框 composable（单例）
 *
 * 用法:
 * ```ts
 * const { confirm: showConfirm } = useConfirmDialog();
 * const ok = await showConfirm({ message: '确定删除？', danger: true });
 * ```
 */
export function useConfirmDialog() {
  return { visible, options, show, confirm, cancel };
}
