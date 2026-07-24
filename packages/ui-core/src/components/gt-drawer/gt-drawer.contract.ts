export const gtDrawerStyleContract = {
  tag: 'gt-drawer',
  parts: ['base', 'layer', 'mask', 'panel', 'header', 'body', 'footer'] as const,
  variables: ['--gt-drawer-width', '--gt-overlay-z-index'] as const,
} as const;
