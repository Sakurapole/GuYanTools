import type * as React from 'react';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'gt-button': React.DetailedHTMLProps<React.ButtonHTMLAttributes<HTMLElement>, HTMLElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'sm' | 'md' | 'lg'; block?: boolean; active?: boolean };
      'gt-icon-button': React.DetailedHTMLProps<React.ButtonHTMLAttributes<HTMLElement>, HTMLElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'sm' | 'md' | 'lg'; shape?: 'square' | 'circle'; label?: string };
      'gt-card': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & { variant?: 'default' | 'muted' | 'elevated' };
      'gt-field': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & { label?: string; hint?: string; error?: string; required?: boolean };
      'gt-empty-state': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & { title?: string; description?: string; compact?: boolean };
      'gt-state-card': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & { state?: 'loading' | 'empty' | 'error' | 'info'; title?: string; description?: string; compact?: boolean };
    }
  }
}

export function registerGuYanReactElements(): void {
  // React plugins opt into element registration explicitly.
}
