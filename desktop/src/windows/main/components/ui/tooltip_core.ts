export type TooltipPlacement = 'top' | 'right' | 'bottom' | 'left';

export type TooltipOptions = {
  content?: string;
  placement?: TooltipPlacement;
  disabled?: boolean;
  delay?: number;
  block?: boolean;
};

type TooltipPoint = { x: number; y: number };

const VIEWPORT_PADDING = 8;
const EDGE_PADDING = 12;
const GAP = 8;
const DEFAULT_MAX_WIDTH = 520;
const DEFAULT_DELAY = 300;

function oppositePlacement(placement: TooltipPlacement): TooltipPlacement {
  switch (placement) {
    case 'top':
      return 'bottom';
    case 'bottom':
      return 'top';
    case 'left':
      return 'right';
    case 'right':
      return 'left';
  }
}

function getPlacementOrder(placement: TooltipPlacement): TooltipPlacement[] {
  const opposite = oppositePlacement(placement);
  const rest = (['top', 'bottom', 'right', 'left'] as TooltipPlacement[])
    .filter((item) => item !== placement && item !== opposite);
  return [placement, opposite, ...rest];
}

function clamp(value: number, min: number, max: number) {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

function getBasePosition(placement: TooltipPlacement, triggerRect: DOMRect, tooltipRect: DOMRect): TooltipPoint {
  switch (placement) {
    case 'top':
      return {
        x: triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2,
        y: triggerRect.top - tooltipRect.height - GAP,
      };
    case 'bottom':
      return {
        x: triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2,
        y: triggerRect.bottom + GAP,
      };
    case 'left':
      return {
        x: triggerRect.left - tooltipRect.width - GAP,
        y: triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2,
      };
    case 'right':
      return {
        x: triggerRect.right + GAP,
        y: triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2,
      };
  }
}

function fitsViewport(point: TooltipPoint, tooltipRect: DOMRect) {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  return (
    point.x >= VIEWPORT_PADDING &&
    point.y >= VIEWPORT_PADDING &&
    point.x + tooltipRect.width <= viewportWidth - VIEWPORT_PADDING &&
    point.y + tooltipRect.height <= viewportHeight - VIEWPORT_PADDING
  );
}

function getVisibleArea(point: TooltipPoint, tooltipRect: DOMRect) {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const left = clamp(point.x, VIEWPORT_PADDING, viewportWidth - VIEWPORT_PADDING);
  const top = clamp(point.y, VIEWPORT_PADDING, viewportHeight - VIEWPORT_PADDING);
  const right = clamp(point.x + tooltipRect.width, VIEWPORT_PADDING, viewportWidth - VIEWPORT_PADDING);
  const bottom = clamp(point.y + tooltipRect.height, VIEWPORT_PADDING, viewportHeight - VIEWPORT_PADDING);
  return Math.max(0, right - left) * Math.max(0, bottom - top);
}

function createTooltipElement(content: string) {
  const tooltip = document.createElement('div');
  tooltip.className = 'ui-tooltip';
  tooltip.style.visibility = 'hidden';

  const contentEl = document.createElement('span');
  contentEl.className = 'ui-tooltip__content';
  contentEl.textContent = content;

  const arrow = document.createElement('span');
  arrow.className = 'ui-tooltip__arrow';

  tooltip.append(contentEl, arrow);
  document.body.appendChild(tooltip);
  return tooltip;
}

export function normalizeTooltipOptions(value: string | TooltipOptions | null | undefined): Required<TooltipOptions> {
  if (typeof value === 'string') {
    return {
      content: value,
      placement: 'top',
      disabled: false,
      delay: DEFAULT_DELAY,
      block: false,
    };
  }

  return {
    content: value?.content ?? '',
    placement: value?.placement ?? 'top',
    disabled: value?.disabled ?? false,
    delay: value?.delay ?? DEFAULT_DELAY,
    block: value?.block ?? false,
  };
}

export function createTooltipController(
  trigger: HTMLElement,
  getOptions: () => string | TooltipOptions | null | undefined,
  getAnchor: () => HTMLElement = () => trigger,
) {
  let tooltip: HTMLElement | null = null;
  let showTimer: number | null = null;
  let hideTimer: number | null = null;
  let positionFrame: number | null = null;

  function options() {
    return normalizeTooltipOptions(getOptions());
  }

  function clearTimers() {
    if (showTimer !== null) {
      clearTimeout(showTimer);
      showTimer = null;
    }
    if (hideTimer !== null) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
  }

  function clearPositionFrame() {
    if (positionFrame !== null) {
      cancelAnimationFrame(positionFrame);
      positionFrame = null;
    }
  }

  function updateTriggerClasses() {
    const current = options();
    trigger.classList.add('ui-tooltip-trigger');
    trigger.classList.toggle('ui-tooltip-trigger--block', current.block);
  }

  function removeTooltip() {
    tooltip?.remove();
    tooltip = null;
  }

  function updatePosition() {
    if (!tooltip) return;

    const current = options();
    const rect = getAnchor().getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const maxWidth = Math.max(80, Math.min(DEFAULT_MAX_WIDTH, viewportWidth - VIEWPORT_PADDING * 2));

    tooltip.style.maxWidth = `${maxWidth}px`;

    const candidates = getPlacementOrder(current.placement).map((placement) => ({
      placement,
      point: getBasePosition(placement, rect, tooltipRect),
    }));
    const fitted = candidates.find(({ point }) => fitsViewport(point, tooltipRect));
    const best = fitted ?? candidates.reduce((winner, candidate) => (
      getVisibleArea(candidate.point, tooltipRect) > getVisibleArea(winner.point, tooltipRect) ? candidate : winner
    ));

    const x = clamp(best.point.x, VIEWPORT_PADDING, viewportWidth - tooltipRect.width - VIEWPORT_PADDING);
    const y = clamp(best.point.y, VIEWPORT_PADDING, viewportHeight - tooltipRect.height - VIEWPORT_PADDING);
    const anchorX = rect.left + rect.width / 2;
    const anchorY = rect.top + rect.height / 2;

    tooltip.classList.remove('ui-tooltip--top', 'ui-tooltip--bottom', 'ui-tooltip--left', 'ui-tooltip--right');
    tooltip.classList.add(`ui-tooltip--${best.placement}`);
    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
    tooltip.style.visibility = 'visible';

    if (best.placement === 'top' || best.placement === 'bottom') {
      tooltip.style.setProperty('--ui-tooltip-arrow-x', `${clamp(anchorX - x, EDGE_PADDING, tooltipRect.width - EDGE_PADDING)}px`);
      tooltip.style.removeProperty('--ui-tooltip-arrow-y');
    } else {
      tooltip.style.setProperty('--ui-tooltip-arrow-y', `${clamp(anchorY - y, EDGE_PADDING, tooltipRect.height - EDGE_PADDING)}px`);
      tooltip.style.removeProperty('--ui-tooltip-arrow-x');
    }
  }

  function schedulePositionUpdate() {
    clearPositionFrame();
    positionFrame = requestAnimationFrame(() => {
      positionFrame = null;
      updatePosition();
    });
  }

  function showTooltip() {
    const current = options();
    if (current.disabled || !current.content) return;

    clearTimers();
    removeTooltip();
    tooltip = createTooltipElement(current.content);
    updatePosition();
    schedulePositionUpdate();
    requestAnimationFrame(() => tooltip?.classList.add('ui-tooltip--visible'));
  }

  function hideTooltip() {
    clearTimers();
    clearPositionFrame();
    const hidingTooltip = tooltip;
    tooltip = null;
    if (!hidingTooltip) return;

    hidingTooltip.classList.remove('ui-tooltip--visible');
    window.setTimeout(() => {
      hidingTooltip.remove();
    }, 150);
  }

  function handleMouseEnter() {
    const current = options();
    if (current.disabled || !current.content) return;

    clearTimers();
    showTimer = window.setTimeout(showTooltip, current.delay);
  }

  function handleMouseLeave() {
    clearTimers();
    hideTimer = window.setTimeout(hideTooltip, 100);
  }

  function handleViewportChange() {
    if (!tooltip) return;
    schedulePositionUpdate();
  }

  function handlePointerDown() {
    hideTooltip();
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      hideTooltip();
    }
  }

  function sync() {
    updateTriggerClasses();
    const current = options();
    if (current.disabled || !current.content) {
      hideTooltip();
      return;
    }
    if (tooltip) {
      const contentEl = tooltip.querySelector<HTMLElement>('.ui-tooltip__content');
      if (contentEl) {
        contentEl.textContent = current.content;
      }
      schedulePositionUpdate();
    }
  }

  trigger.addEventListener('mouseenter', handleMouseEnter);
  trigger.addEventListener('mouseleave', handleMouseLeave);
  trigger.addEventListener('focus', handleMouseEnter);
  trigger.addEventListener('blur', handleMouseLeave);
  trigger.addEventListener('click', handlePointerDown, true);
  window.addEventListener('resize', handleViewportChange);
  window.addEventListener('scroll', handleViewportChange, true);
  document.addEventListener('pointerdown', handlePointerDown, true);
  document.addEventListener('keydown', handleKeyDown, true);
  updateTriggerClasses();

  return {
    sync,
    destroy() {
      clearTimers();
      clearPositionFrame();
      removeTooltip();
      trigger.classList.remove('ui-tooltip-trigger', 'ui-tooltip-trigger--block', 'ui-tooltip-trigger--component');
      trigger.removeEventListener('mouseenter', handleMouseEnter);
      trigger.removeEventListener('mouseleave', handleMouseLeave);
      trigger.removeEventListener('focus', handleMouseEnter);
      trigger.removeEventListener('blur', handleMouseLeave);
      trigger.removeEventListener('click', handlePointerDown, true);
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown, true);
    },
  };
}
