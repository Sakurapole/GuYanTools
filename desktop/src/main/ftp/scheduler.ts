import { app } from 'electron';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { ftpHost } from './host';
import { runFtpTransfer } from './runner';
import type { FtpEventEnvelope } from '@/contracts/ftp';

export type FtpScheduleType = 'once' | 'hourly' | 'daily' | 'weekly' | 'cron';

export interface FtpScheduledTaskRecord {
  id: string;
  label: string;
  profileId: string;
  direction: 'upload' | 'download';
  localPath: string;
  remotePath: string;
  scheduleType: FtpScheduleType;
  conflictPolicy?: 'skip' | 'parallel';
  enabled: boolean;
  includeSubdirectories: boolean;
  onceAt?: number;
  intervalHours?: number;
  timeOfDay?: string;
  dayOfWeek?: number;
  cronExpression?: string;
  nextRunAt?: number;
  lastRunAt?: number;
  lastStatus?: 'idle' | 'running' | 'success' | 'failed';
  lastResult?: string;
  lastTaskId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface UpsertFtpScheduledTaskInput {
  id?: string;
  label: string;
  profileId: string;
  direction: 'upload' | 'download';
  localPath: string;
  remotePath: string;
  scheduleType: FtpScheduleType;
  conflictPolicy?: 'skip' | 'parallel';
  enabled?: boolean;
  includeSubdirectories?: boolean;
  onceAt?: number;
  intervalHours?: number;
  timeOfDay?: string;
  dayOfWeek?: number;
  cronExpression?: string;
}

type PersistedState = {
  version: number;
  tasks: FtpScheduledTaskRecord[];
};

class FtpSchedulerService {
  private tasks: FtpScheduledTaskRecord[] = [];
  private readonly runningTaskMap = new Map<string, string>();
  private timer: NodeJS.Timeout | null = null;
  private initialized = false;
  private readonly legacyStateFile = path.join(app.getPath('userData'), 'ftp_schedules.json');

  async initialize() {
    if (this.initialized) return;
    const restored = await this.loadState();
    this.tasks = restored.tasks;
    if (restored.changed) {
      await this.persistState();
    }
    await this.importLegacyState();
    this.timer = setInterval(() => {
      void this.tick();
    }, 30_000);
    ftpHost.onEvent((event) => this.handleFtpEvent(event));
    this.initialized = true;
  }

  async listTasks() {
    return [...this.tasks].sort((left, right) => (left.nextRunAt ?? Number.MAX_SAFE_INTEGER) - (right.nextRunAt ?? Number.MAX_SAFE_INTEGER));
  }

  async upsertTask(input: UpsertFtpScheduledTaskInput) {
    const now = Date.now();
    validateTaskInput(input);
    const existing = input.id ? this.tasks.find((item) => item.id === input.id) : undefined;
    const nextRecord: FtpScheduledTaskRecord = {
      id: input.id ?? `ftp-schedule-${now}-${Math.random().toString(36).slice(2, 8)}`,
      label: input.label.trim() || '未命名计划任务',
      profileId: input.profileId.trim(),
      direction: input.direction,
      localPath: input.localPath.trim(),
      remotePath: input.remotePath.trim(),
      scheduleType: input.scheduleType,
      conflictPolicy: input.conflictPolicy ?? existing?.conflictPolicy ?? 'skip',
      enabled: input.enabled ?? true,
      includeSubdirectories: input.includeSubdirectories ?? true,
      onceAt: input.onceAt,
      intervalHours: input.intervalHours,
      timeOfDay: input.timeOfDay,
      dayOfWeek: input.dayOfWeek,
      cronExpression: input.cronExpression?.trim(),
      lastRunAt: existing?.lastRunAt,
      lastStatus: existing?.lastStatus ?? 'idle',
      lastResult: existing?.lastResult,
      lastTaskId: existing?.lastTaskId,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    nextRecord.nextRunAt = nextRecord.enabled ? computeNextRunAt(nextRecord, now) : undefined;

    const existingIndex = this.tasks.findIndex((item) => item.id === nextRecord.id);
    const persistedRecord = await this.persistTask(nextRecord);
    if (existingIndex === -1) {
      this.tasks = [...this.tasks, persistedRecord];
    } else {
      this.tasks = this.tasks.map((item, index) => (index === existingIndex ? persistedRecord : item));
    }
    return persistedRecord;
  }

  async deleteTask(id: string) {
    this.tasks = this.tasks.filter((item) => item.id !== id);
    await ftpHost.deleteScheduledTask(id);
  }

  async runTaskNow(id: string) {
    const task = this.tasks.find((item) => item.id === id);
    if (!task) {
      throw new Error(`未找到计划任务：${id}`);
    }
    return this.executeTask(task, Date.now(), true);
  }

  dispose() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick() {
    const now = Date.now();
    const dueTasks = this.tasks.filter((item) => item.enabled && item.nextRunAt && item.nextRunAt <= now);
    for (const task of dueTasks) {
      await this.executeTask(task, now, false);
    }
  }

  private async executeTask(task: FtpScheduledTaskRecord, now: number, manual: boolean) {
    if (!manual && task.conflictPolicy !== 'parallel' && this.isScheduleTaskRunning(task.id)) {
      this.replaceTask({
        ...task,
        lastRunAt: now,
        lastStatus: 'idle',
        lastResult: '上一次执行仍在进行中，已按冲突策略跳过本次触发',
        updatedAt: now,
        nextRunAt: task.scheduleType === 'once'
          ? undefined
          : computeNextRunAt(task, now + 60_000),
      });
      await this.persistState();
      return null;
    }

    const updatedTask: FtpScheduledTaskRecord = {
      ...task,
      lastRunAt: now,
      lastStatus: 'running',
      lastResult: manual ? '手动触发，正在入队' : '计划触发，正在入队',
      updatedAt: now,
      nextRunAt: task.scheduleType === 'once'
        ? undefined
        : computeNextRunAt(task, now + 60_000),
      enabled: task.scheduleType === 'once' ? false : task.enabled,
    };
    this.replaceTask(updatedTask);
    await this.persistState();

    try {
      const result = await runFtpTransfer({
        profileId: task.profileId,
        direction: task.direction,
        localPath: task.localPath,
        remotePath: task.remotePath,
      });
      this.runningTaskMap.set(result.task.id, task.id);
      this.replaceTask({
        ...updatedTask,
        lastTaskId: result.task.id,
        lastResult: `已入队到传输队列：${result.task.fileName || result.task.id}`,
        updatedAt: Date.now(),
      });
      await this.persistState();
      return result.task;
    } catch (error) {
      this.replaceTask({
        ...updatedTask,
        lastStatus: 'failed',
        lastResult: error instanceof Error ? error.message : String(error),
        updatedAt: Date.now(),
      });
      await this.persistState();
      throw error;
    }
  }

  private handleFtpEvent(event: FtpEventEnvelope) {
    if (!event.task) return;
    const scheduleId = this.runningTaskMap.get(event.task.id);
    if (!scheduleId) return;
    if (!['completed', 'failed'].includes(event.task.status)) return;

    this.runningTaskMap.delete(event.task.id);
    const schedule = this.tasks.find((item) => item.id === scheduleId);
    if (!schedule) return;
    this.replaceTask({
      ...schedule,
      lastStatus: event.task.status === 'completed' ? 'success' : 'failed',
      lastResult: event.task.status === 'completed'
        ? '最近一次执行成功'
        : (event.task.errorMessage || '最近一次执行失败'),
      updatedAt: Date.now(),
    });
    void this.persistState();
  }

  private replaceTask(task: FtpScheduledTaskRecord) {
    this.tasks = this.tasks.map((item) => (item.id === task.id ? task : item));
  }

  private isScheduleTaskRunning(scheduleId: string) {
    for (const activeScheduleId of this.runningTaskMap.values()) {
      if (activeScheduleId === scheduleId) {
        return true;
      }
    }
    return false;
  }

  private async loadState(): Promise<{ tasks: FtpScheduledTaskRecord[]; changed: boolean }> {
    try {
      const tasks = await ftpHost.listScheduledTasks();
      let changed = false;
      const normalized = tasks
        .map((task) => {
          try {
            return normalizeLoadedTask(task, Date.now());
          } catch {
            changed = true;
            return null;
          }
        })
        .filter((task): task is { record: FtpScheduledTaskRecord; changed: boolean } => {
          if (!task) {
            changed = true;
            return false;
          }
          if (task.changed) {
            changed = true;
          }
          return true;
        })
        .map((task) => task.record);
      return { tasks: normalized, changed };
    } catch (error) {
      console.error('[FtpScheduler] Failed to load scheduled tasks from SQLite:', error);
      return { tasks: [], changed: false };
    }
  }

  private async persistState() {
    this.tasks = await Promise.all(this.tasks.map((task) => this.persistTask(task)));
  }

  private async persistTask(task: FtpScheduledTaskRecord) {
    return ftpHost.upsertScheduledTask({
      id: task.id,
      label: task.label,
      profileId: task.profileId,
      direction: task.direction,
      localPath: task.localPath,
      remotePath: task.remotePath,
      scheduleType: task.scheduleType,
      conflictPolicy: task.conflictPolicy,
      enabled: task.enabled,
      includeSubdirectories: task.includeSubdirectories,
      onceAt: task.onceAt,
      intervalHours: task.intervalHours,
      timeOfDay: task.timeOfDay,
      dayOfWeek: task.dayOfWeek,
      cronExpression: task.cronExpression,
      nextRunAt: task.nextRunAt,
      lastRunAt: task.lastRunAt,
      lastStatus: task.lastStatus,
      lastResult: task.lastResult,
      lastTaskId: task.lastTaskId,
    });
  }

  private async importLegacyState() {
    let raw: string;
    try {
      raw = await fs.readFile(this.legacyStateFile, 'utf8');
    } catch {
      return;
    }

    let parsed: PersistedState | { tasks?: unknown };
    try {
      parsed = JSON.parse(raw) as PersistedState | { tasks?: unknown };
    } catch (error) {
      console.warn('[FtpScheduler] Failed to parse legacy scheduled task file:', error);
      return;
    }

    const legacyTasks = Array.isArray(parsed?.tasks) ? parsed.tasks : [];
    if (!legacyTasks.length) {
      await this.markLegacyStateImported();
      return;
    }

    const existingIds = new Set(this.tasks.map((task) => task.id));
    let imported = false;
    const nextTasks = [...this.tasks];
    for (const legacyTask of legacyTasks) {
      let normalized: ReturnType<typeof normalizeLoadedTask>;
      try {
        normalized = normalizeLoadedTask(legacyTask, Date.now());
      } catch {
        continue;
      }
      if (!normalized || existingIds.has(normalized.record.id)) {
        continue;
      }
      try {
        const persisted = await this.persistTask(normalized.record);
        existingIds.add(persisted.id);
        nextTasks.push(persisted);
        imported = true;
      } catch (error) {
        console.warn('[FtpScheduler] Failed to import legacy scheduled task:', error);
      }
    }

    if (imported) {
      this.tasks = nextTasks;
    }
    await this.markLegacyStateImported();
  }

  private async markLegacyStateImported() {
    const archiveFile = `${this.legacyStateFile}.migrated-${Date.now()}`;
    try {
      await fs.rename(this.legacyStateFile, archiveFile);
    } catch (error) {
      console.warn('[FtpScheduler] Failed to archive legacy scheduled task file:', error);
    }
  }
}

export const ftpSchedulerService = new FtpSchedulerService();

function computeNextRunAt(task: FtpScheduledTaskRecord, fromTs: number) {
  const fromDate = new Date(fromTs);
  switch (task.scheduleType) {
    case 'once':
      return task.onceAt && task.onceAt > fromTs ? task.onceAt : undefined;
    case 'hourly': {
      const interval = Math.max(1, task.intervalHours ?? 1);
      return fromTs + interval * 60 * 60 * 1000;
    }
    case 'daily': {
      const [hour, minute] = parseTimeOfDay(task.timeOfDay);
      const next = new Date(fromDate);
      next.setSeconds(0, 0);
      next.setHours(hour, minute, 0, 0);
      if (next.getTime() <= fromTs) {
        next.setDate(next.getDate() + 1);
      }
      return next.getTime();
    }
    case 'weekly': {
      const [hour, minute] = parseTimeOfDay(task.timeOfDay);
      const next = new Date(fromDate);
      next.setSeconds(0, 0);
      next.setHours(hour, minute, 0, 0);
      const targetDay = typeof task.dayOfWeek === 'number' ? task.dayOfWeek : 1;
      const currentDay = next.getDay();
      let offset = targetDay - currentDay;
      if (offset < 0 || (offset === 0 && next.getTime() <= fromTs)) {
        offset += 7;
      }
      if (offset === 0 && next.getTime() <= fromTs) {
        offset = 7;
      }
      next.setDate(next.getDate() + offset);
      return next.getTime();
    }
    case 'cron':
      return computeNextCronRunAt(task.cronExpression, fromTs);
    default:
      return undefined;
  }
}

function parseTimeOfDay(value?: string) {
  const [rawHour = '9', rawMinute = '0'] = (value || '09:00').split(':');
  const hour = Math.min(23, Math.max(0, Number(rawHour) || 0));
  const minute = Math.min(59, Math.max(0, Number(rawMinute) || 0));
  return [hour, minute] as const;
}

function validateTaskInput(input: UpsertFtpScheduledTaskInput) {
  if (!input.profileId?.trim()) {
    throw new Error('请选择要执行的 FTP 配置');
  }
  if (!input.localPath?.trim()) {
    throw new Error('本地路径不能为空');
  }
  if (!input.remotePath?.trim()) {
    throw new Error('远程路径不能为空');
  }
  if (input.scheduleType === 'cron') {
    parseCronExpression(input.cronExpression);
  }
}

function normalizeLoadedTask(raw: unknown, now: number) {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Partial<FtpScheduledTaskRecord>;
  if (!candidate.id || !candidate.profileId || !candidate.localPath || !candidate.remotePath) {
    return null;
  }

  const scheduleType = normalizeScheduleType(candidate.scheduleType);
  if (!scheduleType) {
    return null;
  }

  let changed = false;
  const record: FtpScheduledTaskRecord = {
    id: String(candidate.id),
    label: String(candidate.label || '未命名计划任务'),
    profileId: String(candidate.profileId),
    direction: candidate.direction === 'download' ? 'download' : 'upload',
    localPath: String(candidate.localPath),
    remotePath: String(candidate.remotePath),
    scheduleType,
    conflictPolicy: candidate.conflictPolicy === 'parallel' ? 'parallel' : 'skip',
    enabled: candidate.enabled !== false,
    includeSubdirectories: candidate.includeSubdirectories !== false,
    onceAt: toNumberOrUndefined(candidate.onceAt),
    intervalHours: toNumberOrUndefined(candidate.intervalHours),
    timeOfDay: typeof candidate.timeOfDay === 'string' ? candidate.timeOfDay : undefined,
    dayOfWeek: toNumberOrUndefined(candidate.dayOfWeek),
    cronExpression: typeof candidate.cronExpression === 'string' ? candidate.cronExpression.trim() : undefined,
    nextRunAt: toNumberOrUndefined(candidate.nextRunAt),
    lastRunAt: toNumberOrUndefined(candidate.lastRunAt),
    lastStatus: normalizeLastStatus(candidate.lastStatus),
    lastResult: typeof candidate.lastResult === 'string' ? candidate.lastResult : undefined,
    lastTaskId: typeof candidate.lastTaskId === 'string' ? candidate.lastTaskId : undefined,
    createdAt: toNumberOrUndefined(candidate.createdAt) ?? now,
    updatedAt: toNumberOrUndefined(candidate.updatedAt) ?? now,
  };

  if (record.scheduleType === 'cron') {
    parseCronExpression(record.cronExpression);
  }

  if (record.lastStatus === 'running') {
    record.lastStatus = 'failed';
    record.lastResult = '应用重启后恢复计划任务状态，上一轮执行结果未知';
    record.updatedAt = now;
    changed = true;
  }

  if (!record.enabled) {
    if (record.nextRunAt != null) {
      record.nextRunAt = undefined;
      changed = true;
    }
  } else if (record.nextRunAt == null) {
    record.nextRunAt = computeNextRunAt(record, now);
    changed = true;
  }

  return { record, changed };
}

function normalizeScheduleType(value?: string): FtpScheduleType | null {
  if (value === 'once' || value === 'hourly' || value === 'daily' || value === 'weekly' || value === 'cron') {
    return value;
  }
  return null;
}

function normalizeLastStatus(value?: string) {
  if (value === 'running' || value === 'success' || value === 'failed') {
    return value;
  }
  return 'idle' as const;
}

function toNumberOrUndefined(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

type CronField = {
  allowed: Set<number>;
  wildcard: boolean;
};

type ParsedCronExpression = {
  minute: CronField;
  hour: CronField;
  dayOfMonth: CronField;
  month: CronField;
  dayOfWeek: CronField;
};

function parseCronExpression(expression?: string): ParsedCronExpression {
  const raw = expression?.trim();
  if (!raw) {
    throw new Error('Cron 表达式不能为空');
  }
  const segments = raw.split(/\s+/);
  if (segments.length !== 5) {
    throw new Error('Cron 表达式需为 5 段：分钟 小时 日 月 周');
  }
  return {
    minute: parseCronField(segments[0], 0, 59, '分钟'),
    hour: parseCronField(segments[1], 0, 23, '小时'),
    dayOfMonth: parseCronField(segments[2], 1, 31, '日期'),
    month: parseCronField(segments[3], 1, 12, '月份'),
    dayOfWeek: parseCronField(segments[4], 0, 7, '星期', true),
  };
}

function parseCronField(
  segment: string,
  min: number,
  max: number,
  label: string,
  normalizeSunday = false,
): CronField {
  const raw = segment.trim();
  if (!raw) {
    throw new Error(`Cron ${label}字段不能为空`);
  }
  const wildcard = raw === '*';
  const allowed = new Set<number>();
  for (const part of raw.split(',')) {
    const token = part.trim();
    if (!token) {
      throw new Error(`Cron ${label}字段存在空片段`);
    }
    const [rangePart, stepPart] = token.split('/');
    const step = stepPart == null ? 1 : Number(stepPart);
    if (!Number.isInteger(step) || step <= 0) {
      throw new Error(`Cron ${label}字段步长无效：${token}`);
    }

    let rangeStart = min;
    let rangeEnd = max;
    if (rangePart !== '*') {
      if (rangePart.includes('-')) {
        const [startRaw, endRaw] = rangePart.split('-');
        rangeStart = Number(startRaw);
        rangeEnd = Number(endRaw);
      } else {
        rangeStart = Number(rangePart);
        rangeEnd = rangeStart;
      }
      if (!Number.isInteger(rangeStart) || !Number.isInteger(rangeEnd)) {
        throw new Error(`Cron ${label}字段格式无效：${token}`);
      }
      if (normalizeSunday && rangeStart === 0 && rangeEnd === 7) {
        rangeEnd = 6;
      }
      if (normalizeSunday) {
        if (rangeStart === 7) rangeStart = 0;
        if (rangeEnd === 7) rangeEnd = 0;
      }
      if (rangeEnd < rangeStart && !(normalizeSunday && rangeStart <= max && rangeEnd === 0)) {
        throw new Error(`Cron ${label}字段范围无效：${token}`);
      }
    }

    if (normalizeSunday && rangeStart > rangeEnd) {
      for (let value = rangeStart; value <= max; value += step) {
        allowed.add(value === 7 ? 0 : value);
      }
      for (let value = min; value <= rangeEnd; value += step) {
        allowed.add(value === 7 ? 0 : value);
      }
      continue;
    }

    if (rangeStart < min || rangeEnd > max) {
      throw new Error(`Cron ${label}字段超出范围：${token}`);
    }
    for (let value = rangeStart; value <= rangeEnd; value += step) {
      allowed.add(normalizeSunday && value === 7 ? 0 : value);
    }
  }
  if (!allowed.size) {
    throw new Error(`Cron ${label}字段未产生有效值`);
  }
  return { allowed, wildcard };
}

function computeNextCronRunAt(expression: string | undefined, fromTs: number) {
  const cron = parseCronExpression(expression);
  const cursor = new Date(fromTs + 60_000);
  cursor.setSeconds(0, 0);
  const maxAttempts = 60 * 24 * 366 * 5;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (matchesCronExpression(cron, cursor)) {
      return cursor.getTime();
    }
    cursor.setMinutes(cursor.getMinutes() + 1, 0, 0);
  }
  throw new Error(`无法为 Cron 表达式计算下一次执行时间：${expression ?? ''}`);
}

function matchesCronExpression(cron: ParsedCronExpression, date: Date) {
  const minuteMatches = cron.minute.allowed.has(date.getMinutes());
  const hourMatches = cron.hour.allowed.has(date.getHours());
  const monthMatches = cron.month.allowed.has(date.getMonth() + 1);
  if (!minuteMatches || !hourMatches || !monthMatches) {
    return false;
  }

  const dayOfMonthMatches = cron.dayOfMonth.allowed.has(date.getDate());
  const dayOfWeekMatches = cron.dayOfWeek.allowed.has(date.getDay());
  const dayMatches = cron.dayOfMonth.wildcard || cron.dayOfWeek.wildcard
    ? dayOfMonthMatches && dayOfWeekMatches
    : dayOfMonthMatches || dayOfWeekMatches;
  return dayMatches;
}
