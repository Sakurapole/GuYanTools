export const gtStateCardStyleContract = {
  tag: 'gt-state-card',
  parts: ['base', 'icon', 'label', 'title', 'description', 'actions'] as const,
  variables: ['--gt-state-card-background', '--gt-state-card-border-color'] as const,
} as const;
