export const gtInputStyleContract = {
  tag: 'gt-input',
  parts: ['base', 'control', 'prefix', 'suffix', 'stepper'] as const,
  variables: ['--gt-input-background', '--gt-input-border-color', '--gt-input-color'] as const,
} as const;
