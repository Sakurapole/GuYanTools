export const gtDialogStyleContract = {
  tag: 'gt-dialog',
  parts: ['base', 'layer', 'mask', 'panel', 'header', 'body', 'footer'] as const,
  variables: ['--gt-dialog-width', '--gt-overlay-z-index'] as const,
} as const;
