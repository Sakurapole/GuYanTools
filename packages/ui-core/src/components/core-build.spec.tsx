import { describe, expect, it } from 'vitest';
import { h, render } from '@stencil/vitest';

import './gt-button/gt-button';

describe('Stencil core build boundary', () => {
  it('renders a Stencil component with the public gt tag', async () => {
    const { root } = await render(<gt-button>Save</gt-button>);

    expect(root.tagName).toBe('GT-BUTTON');
  });
});
