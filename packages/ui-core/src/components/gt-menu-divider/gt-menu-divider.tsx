import { Component, h, Host } from '@stencil/core';

@Component({ tag: 'gt-menu-divider', shadow: true, styleUrl: 'gt-menu-divider.css' })
export class GtMenuDivider {
  render() { return <Host role="separator"><div part="base" /></Host>; }
}
