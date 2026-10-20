import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { CheatSheetBank } from './bank';
import { searchQuestions, titleFromMarkdown } from '@/shared/cheat_sheet_search';

const roots: string[] = [];
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'gt-cheat-bank-'));
  roots.push(root);
  const file = path.join(root, 'bank.json');
  return { file, bank: new CheatSheetBank(file) };
}
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))); });

describe('cheat sheet question bank', () => {
  it('persists independent same-title questions and serializes concurrent edits', async () => {
    const { bank, file } = await fixture();
    await bank.load();
    const [a, b] = await Promise.all([
      bank.saveQuestion({ title: '并发', markdown: '# A' }),
      bank.saveQuestion({ title: '并发', markdown: '# B' }),
    ]);
    expect(a.id).not.toBe(b.id);
    await bank.saveQuestion({ id: a.id, title: '更新', markdown: '新内容' });
    const restored = await new CheatSheetBank(file).load();
    expect(restored.questions.map((q) => q.title)).toEqual(['更新', '并发']);
    await bank.deleteQuestion(b.id);
    expect((await bank.load()).questions).toHaveLength(1);
  });

  it('matches all normalized title terms and ranks exact then prefix then containment', async () => {
    const { bank } = await fixture();
    await bank.load();
    for (const title of ['关于 Java 并发', 'JAVA 并发详解', 'Ｊａｖａ　并发', '其他']) {
      await bank.saveQuestion({ title, markdown: 'Java 并发正文' });
    }
    const matches = searchQuestions((await bank.load()).questions, ' java  并发 ');
    expect(matches.map((q) => q.title)).toEqual(['Ｊａｖａ　并发', 'JAVA 并发详解', '关于 Java 并发']);
    expect(searchQuestions((await bank.load()).questions, '正文')).toEqual([]);
  });

  it('ignores fenced headings and keeps one imported document as one question', async () => {
    expect(titleFromMarkdown('```md\n# fake\n```\n# 真实标题\n## 子标题', 'fallback.md')).toBe('真实标题');
    expect(titleFromMarkdown('~~~\n# fake\n~~~\n正文', 'fallback.md')).toBe('fallback');
    const { bank } = await fixture();
    await bank.load();
    await bank.importMarkdown([{ name: 'a.md', markdown: '# A\n## B\n正文' }]);
    expect((await bank.load()).questions).toHaveLength(1);
    expect((await bank.load()).questions[0].markdown).toContain('## B');
  });

  it('rejects invalid/oversized edits without changing persisted content', async () => {
    const { bank, file } = await fixture();
    await bank.load();
    await bank.saveQuestion({ title: '保留', markdown: '原文' });
    const before = await fs.readFile(file, 'utf8');
    await expect(bank.saveQuestion({ title: ' ', markdown: 'x' })).rejects.toThrow();
    await expect(bank.saveQuestion({ title: '大文件', markdown: '中'.repeat(400_000) })).rejects.toThrow();
    await expect(bank.updateSettings({ opacity: Number.NaN })).rejects.toThrow();
    expect(await fs.readFile(file, 'utf8')).toBe(before);
  });

  it('keeps a damaged bank intact and refuses to overwrite it', async () => {
    const { bank, file } = await fixture();
    await fs.writeFile(file, '{broken');
    await expect(bank.load()).rejects.toThrow(/题库/);
    await expect(bank.saveQuestion({ title: '新', markdown: '' })).rejects.toThrow();
    expect(await fs.readFile(file, 'utf8')).toBe('{broken');
  });

  it('leaves the last committed state intact when an atomic replacement fails', async () => {
    const { bank, file } = await fixture();
    await bank.load();
    await bank.saveQuestion({ title: '原文', markdown: '保存内容' });
    await fs.rename(file, `${file}.backup`);
    await fs.mkdir(file);
    await expect(bank.saveQuestion({ title: '失败', markdown: '' })).rejects.toThrow();
    expect((await bank.load()).questions.map((q) => q.title)).toEqual(['原文']);
    await bank.flush();
  });
});
