import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  createDefaultCheatSheetSettings,
  type CheatSheetDocument, type CheatSheetQuestion, type CheatSheetSettings,
  type CheatSheetSettingsPatch, type SaveCheatSheetQuestion,
} from '@/contracts/cheat_sheet';
import { normalizeAccelerator } from '@/shared/shortcuts';
import { titleFromMarkdown } from '@/shared/cheat_sheet_search';
export { normalizeSearchTitle, searchQuestions, titleFromMarkdown } from '@/shared/cheat_sheet_search';
export const MAX_QUESTIONS = 5_000;
export const MAX_MARKDOWN_BYTES = 1024 * 1024;
export const MAX_BANK_BYTES = 32 * 1024 * 1024;
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function validateText(title: unknown, markdown: unknown): asserts title is string {
  if (typeof title !== 'string' || !title.trim() || title.length > 300) throw new Error('题目标题须为 1～300 个字符。');
  if (typeof markdown !== 'string' || Buffer.byteLength(markdown, 'utf8') > MAX_MARKDOWN_BYTES) throw new Error('单题 Markdown 不能超过 1 MiB。');
}
function shortcutMap(value: unknown, defaults: Record<string, string>): Record<string, string> {
  if (value === undefined) return { ...defaults };
  if (!record(value) || Object.keys(value).some((key) => !(key in defaults))) throw new Error('未知的快捷键设置。');
  const result = { ...defaults };
  for (const [key, accelerator] of Object.entries(value)) {
    if (typeof accelerator !== 'string' || accelerator.length > 120) throw new Error('快捷键格式无效。');
    const normalized = normalizeAccelerator(accelerator);
    if (accelerator.trim() && !normalized) throw new Error('快捷键格式无效。');
    result[key] = normalized;
  }
  const nonEmpty = Object.values(result).filter(Boolean);
  if (new Set(nonEmpty).size !== nonEmpty.length) throw new Error('同组快捷键不能重复。');
  return result;
}
export function validateSettings(patch: unknown, current = createDefaultCheatSheetSettings()): CheatSheetSettings {
  if (!record(patch) || Object.keys(patch).some((key) => !['opacity', 'alwaysOnTop', 'lastQuestionId', 'shortcuts', 'internalShortcuts'].includes(key))) throw new Error('窗口设置无效。');
  const opacity = patch.opacity ?? current.opacity;
  const alwaysOnTop = patch.alwaysOnTop ?? current.alwaysOnTop;
  const lastQuestionId: string | null = patch.lastQuestionId === undefined ? current.lastQuestionId : (patch.lastQuestionId as string | null);
  if (typeof opacity !== 'number' || !Number.isFinite(opacity) || opacity < 0.2 || opacity > 1) throw new Error('透明度须为 20%～100%。');
  if (typeof alwaysOnTop !== 'boolean' || (lastQuestionId !== null && (typeof lastQuestionId !== 'string' || lastQuestionId.length > 100))) throw new Error('窗口设置无效。');
  return {
    opacity, alwaysOnTop, lastQuestionId,
    shortcuts: shortcutMap(patch.shortcuts, current.shortcuts) as CheatSheetSettings['shortcuts'],
    internalShortcuts: shortcutMap(patch.internalShortcuts, current.internalShortcuts) as CheatSheetSettings['internalShortcuts'],
  };
}
function parseDocument(value: unknown): CheatSheetDocument {
  if (!record(value) || value.schemaVersion !== 1 || !Array.isArray(value.questions) || value.questions.length > MAX_QUESTIONS) throw new Error('题库格式或版本无效。');
  const ids = new Set<string>();
  const questions = value.questions.map((q: unknown): CheatSheetQuestion => {
    if (!record(q) || typeof q.id !== 'string' || !q.id || q.id.length > 100 || ids.has(q.id) || typeof q.createdAt !== 'number' || typeof q.updatedAt !== 'number' || !Number.isFinite(q.createdAt) || !Number.isFinite(q.updatedAt)) throw new Error('题库题目格式无效。');
    validateText(q.title, q.markdown);
    ids.add(q.id);
    return { id: q.id, title: q.title, markdown: q.markdown as string, createdAt: q.createdAt, updatedAt: q.updatedAt };
  });
  return { schemaVersion: 1, questions, settings: validateSettings(value.settings ?? {}) };
}

export class CheatSheetBank {
  private document: CheatSheetDocument | null = null;
  private loading: Promise<CheatSheetDocument> | null = null;
  private pending: Promise<unknown> = Promise.resolve();
  constructor(private readonly filePath: string) {}

  async load(): Promise<CheatSheetDocument> {
    if (this.document) return structuredClone(this.document);
    this.loading ??= this.read();
    try { return structuredClone(await this.loading); }
    finally { this.loading = null; }
  }

  private async read(): Promise<CheatSheetDocument> {
    try {
      const stat = await fs.stat(this.filePath);
      if (stat.size > MAX_BANK_BYTES) throw new Error('题库不能超过 32 MiB。');
      const raw = await fs.readFile(this.filePath, 'utf8');
      this.document = parseDocument(JSON.parse(raw));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('无法读取题库，原文件已保留。请检查格式或从备份恢复。', { cause: error });
      this.document = { schemaVersion: 1, questions: [], settings: createDefaultCheatSheetSettings() };
    }
    return this.document;
  }

  private mutate<T>(change: (next: CheatSheetDocument) => T): Promise<T> {
    const operation = this.pending.then(async () => {
      const next = await this.load();
      const result = change(next);
      if (next.questions.length > MAX_QUESTIONS) throw new Error('题库最多保存 5,000 题。');
      const serialized = JSON.stringify(next);
      if (Buffer.byteLength(serialized, 'utf8') > MAX_BANK_BYTES) throw new Error('题库不能超过 32 MiB。');
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      const temporary = `${this.filePath}.${randomUUID()}.tmp`;
      try {
        await fs.writeFile(temporary, serialized, { encoding: 'utf8', flag: 'wx' });
        await fs.rename(temporary, this.filePath);
      } finally { await fs.rm(temporary, { force: true }).catch((_: unknown): void => undefined); }
      this.document = next;
      return structuredClone(result);
    });
    this.pending = operation.catch((_: unknown): void => undefined);
    return operation;
  }

  saveQuestion(input: SaveCheatSheetQuestion): Promise<CheatSheetQuestion> {
    return this.mutate((next) => {
      if (!record(input)) throw new Error('题目内容无效。');
      validateText(input.title, input.markdown);
      if (input.id !== undefined && (typeof input.id !== 'string' || input.id.length > 100)) throw new Error('题目 ID 无效。');
      const existing = input.id ? next.questions.find((q) => q.id === input.id) : undefined;
      if (input.id && !existing) throw new Error('题目已不存在，请重新选择。');
      const now = Date.now();
      const question: CheatSheetQuestion = { id: existing?.id ?? randomUUID(), title: input.title.trim(), markdown: input.markdown, createdAt: existing?.createdAt ?? now, updatedAt: now };
      if (existing) next.questions[next.questions.indexOf(existing)] = question;
      else next.questions.push(question);
      return question;
    });
  }

  deleteQuestion(id: string): Promise<void> {
    return this.mutate((next) => {
      if (typeof id !== 'string' || !next.questions.some((q) => q.id === id)) throw new Error('题目不存在。');
      next.questions = next.questions.filter((q) => q.id !== id);
      if (next.settings.lastQuestionId === id) next.settings.lastQuestionId = null;
    });
  }

  importMarkdown(files: { name: string; markdown: string }[]): Promise<number> {
    return this.mutate((next) => {
      if (!Array.isArray(files) || files.length > MAX_QUESTIONS) throw new Error('导入文件数量无效。');
      for (const file of files) {
        const title = titleFromMarkdown(file.markdown, file.name);
        validateText(title, file.markdown);
        const now = Date.now();
        next.questions.push({ id: randomUUID(), title, markdown: file.markdown, createdAt: now, updatedAt: now });
      }
      return files.length;
    });
  }

  updateSettings(patch: CheatSheetSettingsPatch): Promise<CheatSheetSettings> {
    return this.mutate((next) => { next.settings = validateSettings(patch, next.settings); return next.settings; });
  }
  async flush(): Promise<void> { await this.pending; }
}
