export const gtFieldStyleContract = {
  tag: 'gt-field',
  parts: ['base', 'label', 'body', 'hint', 'error'] as const,
  variables: ['--gt-field-label-color', '--gt-field-hint-color', '--gt-field-error-color'] as const,
} as const;
