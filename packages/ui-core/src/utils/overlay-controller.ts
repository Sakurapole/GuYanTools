export type OverlayPlacement = 'top' | 'right' | 'bottom' | 'left';
export type OverlayType = 'dialog' | 'drawer' | 'tooltip' | 'select' | 'popup';

export interface OverlayPortalOptions {
  target?: HTMLElement;
  overlay?: boolean;
}

export interface OverlayRect {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

export interface OverlaySize {
  height: number;
  width: number;
}

export function computeOverlayPlacement(
  placement: OverlayPlacement,
  anchor: OverlayRect,
  overlay: OverlaySize,
  viewport: OverlaySize,
): OverlayPlacement {
  if (placement === 'right' && anchor.right + overlay.width > viewport.width) return 'left';
  if (placement === 'left' && anchor.left - overlay.width < 0) return 'right';
  if (placement === 'top' && anchor.top - overlay.height < 0) return 'bottom';
  if (placement === 'bottom' && anchor.bottom + overlay.height > viewport.height) return 'top';
  return placement;
}

export class OverlayPortal {
  readonly element: HTMLElement;
  private readonly source: HTMLElement;
  private readonly styleObserver?: MutationObserver;

  private readonly reposition = (): void => {
    this.element.dispatchEvent(new Event('gt-overlay-reposition'));
  };

  constructor(type: OverlayType, content: DocumentFragment | string, source: HTMLElement, onMask?: () => void, options: OverlayPortalOptions = {}) {
    this.source = source;
    this.element = document.createElement('div');
    this.element.dataset.gtOverlay = type;
    const layer = document.createElement('div');
    layer.setAttribute('part', 'layer');
    this.element.append(layer);

    if (type === 'dialog' || type === 'drawer' || (type === 'popup' && options.overlay)) {
      const mask = document.createElement('div');
      mask.dataset.overlayMask = '';
      mask.setAttribute('part', 'mask');
      layer.append(mask);
      mask.addEventListener('click', () => onMask?.());
    }

    const panel = document.createElement(type === 'tooltip' || type === 'select' || type === 'popup' ? 'div' : 'section');
    panel.className = 'panel';
    panel.setAttribute('part', 'panel');
    panel.setAttribute('role', type === 'tooltip' ? 'tooltip' : type === 'select' ? 'listbox' : 'dialog');
    if (type === 'dialog' || type === 'drawer') {
      panel.setAttribute('aria-modal', 'true');
      panel.tabIndex = -1;
    }
    layer.append(panel);

    const header = document.createElement('header');
    header.setAttribute('part', 'header');
    const body = document.createElement('div');
    body.setAttribute('part', 'body');
    const footer = document.createElement('footer');
    footer.setAttribute('part', 'footer');
    panel.append(header, body, footer);

    if (typeof content === 'string') {
      body.textContent = content;
    } else {
      for (const node of Array.from(content.childNodes)) {
        const slot = node instanceof HTMLElement ? node.getAttribute('slot') : null;
        if (slot === 'header') header.append(node);
        else if (slot === 'footer') footer.append(node);
        else body.append(node);
      }
    }

    this.copyVariables();
    if (typeof MutationObserver !== 'undefined') {
      this.styleObserver = new MutationObserver(() => this.copyVariables());
      this.styleObserver.observe(this.source, { attributes: true, attributeFilter: ['class', 'style'] });
      this.styleObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] });
    }
    (options.target ?? document.body).append(this.element);
    window.addEventListener('resize', this.reposition);
    window.addEventListener('scroll', this.reposition, true);
  }

  destroy(): void {
    window.removeEventListener('resize', this.reposition);
    window.removeEventListener('scroll', this.reposition, true);
    this.styleObserver?.disconnect();
    this.element.remove();
  }

  private copyVariables(): void {
    const styles = getComputedStyle(this.source);
    const names = new Set<string>();

    this.element.style.fontFamily = styles.fontFamily;
    this.element.style.fontSize = styles.fontSize;
    this.element.style.fontWeight = styles.fontWeight;
    this.element.style.lineHeight = styles.lineHeight;
    this.element.style.letterSpacing = styles.letterSpacing;

    for (const name of ['--ui-font-family', '--app-font-family', '--gt-font-family']) names.add(name);
    for (let index = 0; index < styles.length; index += 1) {
      const name = styles.item(index);
      if (name.startsWith('--gt-') || name.startsWith('--ui-') || name.startsWith('--app-')) names.add(name);
    }
    const inlineStyle = this.source.getAttribute('style') ?? '';
    for (const match of inlineStyle.matchAll(/(--(?:gt|ui|app)-[\w-]+)\s*:/g)) names.add(match[1]);
    for (const name of names) this.element.style.setProperty(name, styles.getPropertyValue(name) || this.source.style.getPropertyValue(name));
  }
}
