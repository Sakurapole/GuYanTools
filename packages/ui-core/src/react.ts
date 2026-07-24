import type * as React from 'react';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      [elementName: `gt-${string}`]: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
    }
  }
}

export function registerGuYanReactElements(): void {
  // React plugins opt into element registration explicitly.
}
