export function choosePreviousTab(
  tabOrder: readonly string[],
  activationHistory: readonly string[],
  survivingIds: ReadonlySet<string>
): string | null {
  for (const id of [...activationHistory].reverse()) {
    if (survivingIds.has(id)) return id;
  }
  return tabOrder.find((id) => survivingIds.has(id)) ?? null;
}
