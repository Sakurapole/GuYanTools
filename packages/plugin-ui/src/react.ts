import type * as React from 'react';

export interface GuYanButtonClickDetail {
  disabled: boolean;
}

export interface GuYanInputDetail {
  value: string;
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'gt-button': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
        size?: 'sm' | 'md' | 'lg';
        disabled?: boolean;
      };
      'gt-input': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        value?: string;
        placeholder?: string;
        type?: string;
        disabled?: boolean;
      };
      'gt-card': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
      'gt-dialog': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & { open?: boolean };
    }
  }
}

export function registerGuYanReactElements(): void {
  // Importing the root registration function is intentionally left to the plugin entry.
}
