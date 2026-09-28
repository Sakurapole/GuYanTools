/**
 * 浮层外部点击判定。
 * 必须用 composedPath：Shadow DOM 下 event.target 会被重定向到宿主，
 * 而 host.contains(host) === true，会把外部点击误判为内部。
 */
export function isEventOutside(event: Event, nodes: Array<Node | null | undefined>): boolean {
  const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
  if (path.length > 0) {
    return !nodes.some((node) => Boolean(node) && path.includes(node as Node));
  }

  const target = event.target as Node | null;
  if (!target) return true;
  return !nodes.some((node) => {
    if (!node) return false;
    if (node === target) return true;
    return typeof (node as Element).contains === 'function' && (node as Element).contains(target);
  });
}
