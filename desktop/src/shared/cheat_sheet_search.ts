export function normalizeSearchTitle(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim();
}
export function searchQuestions<T extends { title: string; updatedAt: number; id: string }>(questions: T[], query: string): T[] {
  const term = normalizeSearchTitle(query);
  const words = term.split(' ').filter(Boolean);
  const rank = (q: T) => { const title = normalizeSearchTitle(q.title); return title === term ? 0 : title.startsWith(term) ? 1 : 2; };
  return questions.filter((q) => words.every((word) => normalizeSearchTitle(q.title).includes(word)))
    .sort((a, b) => rank(a) - rank(b) || b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
}
export function titleFromMarkdown(markdown: string, filename: string): string {
  let fence: { char: string; length: number } | null = null;
  for (const line of markdown.replace(/^\uFEFF/, '').split(/\r?\n/u)) {
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/u.exec(line);
    if (marker) {
      if (!fence) fence = { char: marker[1][0], length: marker[1].length };
      else if (marker[1][0] === fence.char && marker[1].length >= fence.length && !marker[2].trim()) fence = null;
      continue;
    }
    if (fence) continue;
    const heading = /^ {0,3}#\s+(.+?)\s*#*\s*$/u.exec(line);
    if (heading) return heading[1].trim();
  }
  const basename = filename.replace(/^.*[\\/]/u, '');
  return basename.replace(/\.[^.]*$/u, '');
}
