export const gtEmptyStateStyleContract = {
  tag: 'gt-empty-state',
  parts: ['base', 'icon', 'title', 'description', 'actions'] as const,
  variables: ['--gt-empty-state-color'] as const,
} as const;
