#!/usr/bin/env node
/**
 * 将已安装版本（生产环境）的数据同步到开发态 userData 目录。
 *
 * 安全要求：
 * - 已安装的 GuYanTools 必须未运行（SQLite WAL 模式下文件被锁定）
 * - 开发态应用也应关闭（避免目标文件被锁定）
 *
 * 用法（在 desktop 目录下执行）：
 *   node scripts/sync-dev-data.cjs            # 交互式确认
 *   node scripts/sync-dev-data.cjs --force     # 跳过确认
 *   node scripts/sync-dev-data.cjs --no-assets  # 跳过资源目录（knowledge-assets 等）
 *   node scripts/sync-dev-data.cjs --dry-run    # 只显示计划，不实际复制
 */

'use strict';

const fs = require('fs-extra');
const path = require('node:path');
const os = require('node:os');
const { execSync } = require('node:child_process');
const readline = require('node:readline');

// ── Windows 控制台 UTF-8 ──
if (process.platform === 'win32') {
  try { execSync('chcp 65001', { stdio: 'ignore' }); } catch { /* ignore */ }
}

const APPDATA = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
const PROD_DIR = path.join(APPDATA, 'GuYanTools');
const DEV_DIR = path.join(APPDATA, 'GuyanTools-dev');

// ── 同步项定义 ──

// 核心数据（必须同步）
const CORE_ITEMS = [
  { name: 'guyantools.db',           desc: 'SQLite 数据库' },
  { name: 'guyantools.db-wal',       desc: 'SQLite WAL 日志',  optional: true },
  { name: 'guyantools.db-shm',       desc: 'SQLite 共享内存',   optional: true },
  { name: 'guyantools.config.json',  desc: '应用配置' },
  { name: 'sync',                    desc: '同步配置',          type: 'dir' },
  { name: 'sync-secrets',            desc: '同步密钥',          type: 'dir' },
  { name: 'ftp_schedules.json',      desc: 'FTP 调度状态',      optional: true },
  { name: 'screenshot-pin-state.json', desc: '截图固定窗口状态', optional: true },
];

// 资源目录（较大，可通过 --no-assets 跳过）
const ASSET_ITEMS = [
  { name: 'knowledge-assets',                desc: '知识库资源',       type: 'dir', optional: true },
  { name: 'multi-device-clipboard-assets',   desc: '多设备剪贴板资源', type: 'dir', optional: true },
  { name: 'guyan-plugins',                   desc: '已安装插件',       type: 'dir', optional: true },
  { name: 'chrome-extensions',               desc: 'Chrome 扩展',     type: 'dir', optional: true },
];

// ── 工具函数 ──

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(2)} GB`;
}

function getDirSize(dirPath) {
  let total = 0;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dirPath, entry.name);
    if (entry.isFile()) {
      try { total += fs.statSync(full).size; } catch { /* ignore */ }
    } else if (entry.isDirectory()) {
      total += getDirSize(full);
    }
  }
  return total;
}

function getItemSize(itemPath) {
  try {
    const stat = fs.statSync(itemPath);
    return stat.isFile() ? stat.size : getDirSize(itemPath);
  } catch {
    return 0;
  }
}

function isProdAppRunning() {
  const exeNames = ['GuYanTools.exe', 'guyantools.exe'];
  try {
    const output = execSync('tasklist /NH /FO CSV', { encoding: 'utf8' }).toLowerCase();
    return exeNames.some(name => output.includes(name.toLowerCase()));
  } catch {
    return false;
  }
}

function isDevDbLocked() {
  const dbPath = path.join(DEV_DIR, 'guyantools.db');
  if (!fs.existsSync(dbPath)) return false;
  try {
    const fd = fs.openSync(dbPath, 'r+');
    fs.closeSync(fd);
    return false;
  } catch {
    return true;
  }
}

function confirm(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y' || answer.trim().toLowerCase() === 'yes');
    });
  });
}

// ── 主逻辑 ──

async function main() {
  const args = process.argv.slice(2);
  const force    = args.includes('--force');
  const noAssets = args.includes('--no-assets');
  const dryRun   = args.includes('--dry-run');

  console.log('=== GuYanTools 开发态数据同步 ===\n');
  console.log(`生产目录: ${PROD_DIR}`);
  console.log(`开发目录: ${DEV_DIR}\n`);

  // 1. 检查生产目录
  if (!fs.existsSync(PROD_DIR)) {
    console.error('错误: 未找到已安装版本的数据目录。');
    console.error(`请确认 GuYanTools 已安装并至少运行过一次，目录应位于: ${PROD_DIR}`);
    process.exit(1);
  }

  // 2. 检查已安装应用是否在运行
  if (isProdAppRunning()) {
    console.error('错误: 已安装的 GuYanTools 正在运行。');
    console.error('运行中的应用会锁定 SQLite 数据库文件，直接复制可能导致数据损坏。');
    console.error('请先关闭已安装版本，然后重新运行此脚本。');
    process.exit(1);
  }

  // 3. 检查开发态应用是否在运行（通过数据库文件锁检测）
  if (isDevDbLocked()) {
    console.error('错误: 开发态应用可能正在运行，数据库文件被锁定。');
    console.error('请先关闭开发态应用，然后重新运行此脚本。');
    process.exit(1);
  }

  // 4. 构建同步计划
  const items = [...CORE_ITEMS];
  if (!noAssets) items.push(...ASSET_ITEMS);

  console.log('待同步内容:\n');
  let totalSize = 0;
  const plan = [];

  for (const item of items) {
    const src = path.join(PROD_DIR, item.name);
    const exists = fs.existsSync(src);
    const size = exists ? getItemSize(src) : 0;
    totalSize += size;
    plan.push({ item, exists, size });

    if (exists) {
      console.log(`  [✓] ${item.desc} (${item.name}) — ${formatSize(size)}`);
    } else if (item.optional) {
      console.log(`  [-] ${item.desc} (${item.name}) — 不存在，跳过`);
    } else {
      console.log(`  [!] ${item.desc} (${item.name}) — 不存在（必需）`);
    }
  }

  console.log(`\n总计: ${formatSize(totalSize)}\n`);

  if (dryRun) {
    console.log('--dry-run 模式: 未执行实际复制。');
    return;
  }

  // 5. 确认
  if (!force) {
    const ok = await confirm('确认同步？这将覆盖开发态目录中的同名文件。 [y/N] ');
    if (!ok) {
      console.log('已取消。');
      return;
    }
  }

  // 6. 执行同步
  console.log('\n同步中...\n');
  await fs.ensureDir(DEV_DIR);

  let okCount = 0, skipCount = 0, failCount = 0;

  for (const { item, exists } of plan) {
    if (!exists) {
      if (item.optional) { skipCount++; continue; }
      console.log(`  [✗] ${item.desc} — 源文件不存在`);
      failCount++;
      continue;
    }

    const src = path.join(PROD_DIR, item.name);
    const dest = path.join(DEV_DIR, item.name);

    try {
      await fs.copy(src, dest, { overwrite: true });
      const size = getItemSize(src);
      console.log(`  [✓] ${item.desc} (${item.name})${size ? ` — ${formatSize(size)}` : ''}`);
      okCount++;
    } catch (error) {
      console.error(`  [✗] ${item.desc} (${item.name}) — ${error.message}`);
      failCount++;
    }
  }

  console.log(`\n同步完成: ${okCount} 成功, ${skipCount} 跳过, ${failCount} 失败`);
  console.log(`开发态数据目录: ${DEV_DIR}`);

  if (failCount > 0) process.exit(1);
}

main().catch(error => {
  console.error('同步失败:', error);
  process.exit(1);
});
