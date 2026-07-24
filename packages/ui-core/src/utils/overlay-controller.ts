export type OverlayPlacement = 'top' | 'right' | 'bottom' | 'left';

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

  private readonly reposition = (): void => {
    this.element.dispatchEvent(new Event('gt-overlay-reposition'));
  };

  constructor(type: 'dialog' | 'drawer' | 'tooltip', content: DocumentFragment | string, onMask?: () => void) {
    this.element = document.createElement('div');
    this.element.dataset.gtOverlay = type;
    this.element.innerHTML = `<style>[data-gt-overlay]{position:fixed;inset:0;z-index:var(--gt-z-overlay);font-family:var(--gt-font-family)}[data-gt-overlay="tooltip"]{inset:auto;z-index:var(--gt-z-tooltip)}.mask{position:absolute;inset:0;background:var(--gt-color-overlay)}.panel{position:relative;box-sizing:border-box;margin:auto;max-width:calc(100vw - 32px);max-height:calc(100vh - 32px);overflow:auto;border:1px solid var(--gt-color-border);border-radius:var(--gt-radius-md);background:var(--gt-color-surface);box-shadow:var(--gt-shadow-lg);color:var(--gt-color-text)}[data-gt-overlay="dialog"] .panel{width:min(560px,calc(100vw - 32px));margin-top:10vh}[data-gt-overlay="drawer"] .panel{width:min(400px,90vw);height:100%;margin-right:0;border-radius:0}[data-gt-overlay="tooltip"] .panel{padding:var(--gt-space-sm);white-space:nowrap}</style>${type === 'tooltip' ? '<div class="panel" role="tooltip"></div>' : '<div class="mask" data-overlay-mask></div><section class="panel" role="dialog" aria-modal="true" tabindex="-1"></section>'}`;

    const panel = this.element.querySelector<HTMLElement>('.panel');
    if (!panel) throw new Error('Overlay panel was not created.');
    if (typeof content === 'string') panel.textContent = content;
    else panel.append(content);

    this.element.querySelector<HTMLElement>('[data-overlay-mask]')?.addEventListener('click', () => onMask?.());
    document.body.append(this.element);
    window.addEventListener('resize', this.reposition);
    window.addEventListener('scroll', this.reposition, true);
  }

  destroy(): void {
    window.removeEventListener('resize', this.reposition);
    window.removeEventListener('scroll', this.reposition, true);
    this.element.remove();
  }
}
