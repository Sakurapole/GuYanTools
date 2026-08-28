export const gtTimePickerStyleContract = {
  tag: 'gt-time-picker',
  parts: ['base', 'trigger', 'icon', 'label', 'arrow', 'columns', 'column', 'column-header', 'list', 'item', 'separator', 'footer-actions', 'now', 'confirm'] as const,
  variables: ['--ui-control-height-md', '--ui-input-border', '--ui-input-bg', '--ui-input-focus-border', '--ui-menu-shadow'] as const,
} as const;
