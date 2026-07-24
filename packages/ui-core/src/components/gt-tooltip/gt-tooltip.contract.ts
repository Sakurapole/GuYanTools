export const gtTooltipStyleContract = {
  tag: 'gt-tooltip',
  parts: ['base', 'layer', 'panel'] as const,
  variables: ['--gt-tooltip-background', '--gt-tooltip-color', '--gt-tooltip-z-index'] as const,
} as const;
