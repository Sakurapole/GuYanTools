import type { QuickLaunchHighlightRange } from '@/contracts/quick_launch';

export interface MatchField {
  value: string;
  weight: number;
}

export interface MatchScore {
  score: number;
  titleHighlights?: QuickLaunchHighlightRange[];
  subtitleHighlights?: QuickLaunchHighlightRange[];
}

function normalize(value: string) {
  return value.trim().toLocaleLowerCase();
}

function makeRange(start: number, end: number): QuickLaunchHighlightRange[] {
  return start >= 0 && end > start ? [{ start, end }] : [];
}

export function scoreQuickLaunchFields(
  query: string,
  title: MatchField,
  subtitle?: MatchField,
  keywords: MatchField[] = [],
): MatchScore | null {
  const normalizedQuery = normalize(query);
  const fields = [
    { ...title, kind: 'title' as const },
    ...(subtitle ? [{ ...subtitle, kind: 'subtitle' as const }] : []),
    ...keywords.map((field) => ({ ...field, kind: 'keyword' as const })),
  ];

  if (!normalizedQuery) {
    return { score: title.weight };
  }

  let bestScore = 0;
  let titleHighlights: QuickLaunchHighlightRange[] | undefined;
  let subtitleHighlights: QuickLaunchHighlightRange[] | undefined;

  for (const field of fields) {
    const normalizedValue = normalize(field.value);
    if (!normalizedValue) {
      continue;
    }

    const index = normalizedValue.indexOf(normalizedQuery);
    if (index < 0) {
      continue;
    }

    const exactBoost = normalizedValue === normalizedQuery ? 120 : 0;
    const prefixBoost = index === 0 ? 60 : 0;
    const densityBoost = Math.min(30, Math.round((normalizedQuery.length / normalizedValue.length) * 30));
    const score = field.weight + exactBoost + prefixBoost + densityBoost;
    if (score > bestScore) {
      bestScore = score;
    }

    const ranges = makeRange(index, index + normalizedQuery.length);
    if (field.kind === 'title') {
      titleHighlights = ranges;
    }
    if (field.kind === 'subtitle') {
      subtitleHighlights = ranges;
    }
  }

  if (bestScore <= 0) {
    return null;
  }

  return {
    score: bestScore,
    titleHighlights,
    subtitleHighlights,
  };
}

export function compactSnippet(value: string, maxLength = 120) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trim()}...`;
}
