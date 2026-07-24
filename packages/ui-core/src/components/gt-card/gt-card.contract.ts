export const gtCardStyleContract = {
  tag: 'gt-card',
  parts: ['base', 'header', 'body', 'footer'] as const,
  variables: ['--gt-card-background', '--gt-card-border-color', '--gt-card-shadow'] as const,
} as const;
