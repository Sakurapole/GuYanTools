export const gtDatePickerStyleContract = {
  tag: 'gt-date-picker',
  parts: ['base', 'trigger', 'icon', 'label', 'clear', 'calendar', 'nav', 'nav-prev', 'nav-title', 'nav-next', 'weekdays', 'grid', 'day'] as const,
  variables: ['--ui-control-height-md', '--ui-input-border', '--ui-input-bg', '--ui-input-focus-border', '--ui-menu-shadow'] as const,
} as const;
