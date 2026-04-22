import type { FileTransferEntry } from '@/contracts/ftp';
import type { PanelFilterState } from '../types';

export function matchesPanelFilter(entry: FileTransferEntry, query: string, filterState: PanelFilterState) {
  return matchesSearchQuery(entry, query) && matchesRuleFilter(entry, filterState);
}

export function matchesSearchQuery(entry: FileTransferEntry, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;
  if (hasWildcardQuery(normalizedQuery)) {
    const matcher = wildcardToRegExp(normalizedQuery);
    return matcher.test(entry.name.toLowerCase()) || matcher.test(entry.path.toLowerCase());
  }
  return entry.name.toLowerCase().includes(normalizedQuery)
    || entry.path.toLowerCase().includes(normalizedQuery);
}

export function hasWildcardQuery(query: string) {
  return query.includes('*') || query.includes('?');
}

export function wildcardToRegExp(pattern: string) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped.replace(/\*/g, '.*').replace(/\?/g, '.')}$`, 'i');
}

export function highlightEntryName(name: string, query: string) {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return escapeHtml(name);

  const tokens = hasWildcardQuery(normalizedQuery)
    ? normalizedQuery
      .split(/[\*\?]+/)
      .map((token) => token.trim())
      .filter(Boolean)
    : [normalizedQuery];
  if (!tokens.length) return escapeHtml(name);

  const loweredName = name.toLowerCase();
  const loweredTokens = tokens.map((token) => token.toLowerCase());
  const ranges: Array<[number, number]> = [];

  for (const token of loweredTokens) {
    let searchIndex = 0;
    while (searchIndex < loweredName.length) {
      const start = loweredName.indexOf(token, searchIndex);
      if (start === -1) break;
      ranges.push([start, start + token.length]);
      searchIndex = start + token.length;
    }
  }

  if (!ranges.length) return escapeHtml(name);

  ranges.sort((left, right) => left[0] - right[0]);
  const merged: Array<[number, number]> = [];
  for (const range of ranges) {
    const previous = merged[merged.length - 1];
    if (!previous || range[0] > previous[1]) {
      merged.push(range);
      continue;
    }
    previous[1] = Math.max(previous[1], range[1]);
  }

  let cursor = 0;
  let html = '';
  for (const [start, end] of merged) {
    if (cursor < start) {
      html += escapeHtml(name.slice(cursor, start));
    }
    html += `<mark class="ftp-entry__highlight">${escapeHtml(name.slice(start, end))}</mark>`;
    cursor = end;
  }
  if (cursor < name.length) {
    html += escapeHtml(name.slice(cursor));
  }
  return html;
}

export function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function matchesRuleFilter(entry: FileTransferEntry, filterState: PanelFilterState) {
  if (filterState.mode === 'files' && entry.isDir) return false;
  if (filterState.mode === 'folders' && !entry.isDir) return false;
  if (filterState.hideHidden && isHiddenEntry(entry.name)) return false;

  const conditions: boolean[] = [];
  const normalizedExtension = normalizeExtensionFilter(filterState.extensionQuery);
  const minSizeBytes = normalizeSizeFilter(filterState.minSizeKb);
  const maxSizeBytes = normalizeSizeFilter(filterState.maxSizeKb);
  const modifiedWithinDays = normalizeDaysFilter(filterState.modifiedWithinDays);

  if (normalizedExtension) {
    conditions.push(!entry.isDir && entry.name.toLowerCase().endsWith(normalizedExtension));
  }
  if (typeof minSizeBytes === 'number') {
    conditions.push(!entry.isDir && entry.size >= minSizeBytes);
  }
  if (typeof maxSizeBytes === 'number') {
    conditions.push(!entry.isDir && entry.size <= maxSizeBytes);
  }
  if (typeof modifiedWithinDays === 'number') {
    const modifiedAt = entry.modifiedAt ?? 0;
    const ageLimit = Date.now() - modifiedWithinDays * 24 * 60 * 60 * 1000;
    conditions.push(modifiedAt > 0 && modifiedAt >= ageLimit);
  }

  if (!conditions.length) {
    return true;
  }

  return filterState.operator === 'or'
    ? conditions.some(Boolean)
    : conditions.every(Boolean);
}

export function isHiddenEntry(name: string) {
  return name.startsWith('.');
}

export function normalizeExtensionFilter(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return '';
  return normalized.startsWith('.') ? normalized : `.${normalized}`;
}

export function panelFilterSummary(filterState: PanelFilterState) {
  const tokens: string[] = [];
  if (filterState.mode === 'files') tokens.push('仅文件');
  if (filterState.mode === 'folders') tokens.push('仅文件夹');
  if (filterState.hideHidden) tokens.push('隐藏隐藏项');
  if (filterState.extensionQuery.trim()) tokens.push(`扩展名 ${normalizeExtensionFilter(filterState.extensionQuery)}`);
  if (filterState.minSizeKb.trim()) tokens.push(`最小 ${filterState.minSizeKb.trim()} KB`);
  if (filterState.maxSizeKb.trim()) tokens.push(`最大 ${filterState.maxSizeKb.trim()} KB`);
  if (filterState.modifiedWithinDays.trim()) tokens.push(`最近 ${filterState.modifiedWithinDays.trim()} 天`);
  if (tokens.length > 1) {
    tokens.unshift(filterState.operator === 'or' ? 'OR' : 'AND');
  }
  return tokens.length ? tokens.join(' · ') : '未启用';
}

export function clonePanelFilterState(filterState: PanelFilterState): PanelFilterState {
  return {
    mode: filterState.mode,
    operator: filterState.operator,
    hideHidden: filterState.hideHidden,
    extensionQuery: filterState.extensionQuery,
    minSizeKb: filterState.minSizeKb,
    maxSizeKb: filterState.maxSizeKb,
    modifiedWithinDays: filterState.modifiedWithinDays,
  };
}

export function isRuleFilterActive(filterState: PanelFilterState) {
  return filterState.mode !== 'all'
    || filterState.hideHidden
    || Boolean(filterState.extensionQuery.trim())
    || Boolean(filterState.minSizeKb.trim())
    || Boolean(filterState.maxSizeKb.trim())
    || Boolean(filterState.modifiedWithinDays.trim());
}

export function normalizeSizeFilter(value: string) {
  const normalized = value.trim();
  if (!normalized) return null;
  const sizeKb = Number(normalized);
  if (!Number.isFinite(sizeKb) || sizeKb < 0) return null;
  return Math.round(sizeKb * 1024);
}

export function normalizeDaysFilter(value: string) {
  const normalized = value.trim();
  if (!normalized) return null;
  const days = Number(normalized);
  if (!Number.isFinite(days) || days < 0) return null;
  return days;
}
