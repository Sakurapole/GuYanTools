export const gtButtonStyleContract = {
  tag: 'gt-button',
  parts: ['base', 'icon', 'label'] as const,
  variables: ['--gt-button-background', '--gt-button-border-color', '--gt-button-color', '--gt-button-shadow'] as const,
} as const;
