import { GuYanElement } from './base';

const styles = `
  :host {
    display: block;
    width: 100%;
    min-height: 120px;
    max-height: 280px;
    overflow: auto;
    border: 1px solid var(--gt-color-border, #d7dbe5);
    border-radius: var(--gt-radius-sm, 8px);
    background: var(--gt-color-surface, #fff);
    color: var(--gt-color-text, #1f2430);
    font-family: var(--gt-font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
    font-size: var(--gt-font-size-sm, 12px);
    line-height: 1.55;
  }
  .row {
    display: grid;
    grid-template-columns: auto auto 1fr;
    gap: 8px;
    padding: 6px 10px;
    border-bottom: 1px solid var(--gt-color-border-subtle, #eef1f6);
  }
  .row:last-child { border-bottom: 0; }
  .time { color: var(--gt-color-text-muted, #8a93a6); }
  .level { font-weight: 700; text-transform: uppercase; }
  .level[data-level="info"] { color: var(--gt-color-primary, #4f6ef7); }
  .level[data-level="warn"] { color: var(--gt-color-warning, #d18a00); }
  .level[data-level="error"] { color: var(--gt-color-danger, #d64545); }
  .message { white-space: pre-wrap; overflow-wrap: anywhere; }
  :host([empty])::after {
    content: attr(empty-text);
    display: block;
    padding: 16px;
    color: var(--gt-color-text-muted, #8a93a6);
  }
`;

export type GuYanLogLevel = 'info' | 'warn' | 'error';

export interface GuYanLogEntry {
  time?: string;
  level?: GuYanLogLevel;
  message: string;
}

export class GuYanLogViewElement extends GuYanElement {
  static observedAttributes = ['empty-text'];
  private container!: HTMLElement;
  private entries: GuYanLogEntry[] = [];

  constructor() {
    super();
    this.root.innerHTML = `<style>${styles}</style><div class="list" part="list"></div>`;
    this.container = this.root.querySelector('.list')!;
  }

  setLogs(entries: GuYanLogEntry[]) {
    this.entries = Array.isArray(entries) ? entries : [];
    this.render();
  }

  appendLog(entry: GuYanLogEntry) {
    this.entries.push(entry);
    this.render();
    this.scrollTop = this.scrollHeight;
  }

  connectedCallback() {
    this.render();
  }
  attributeChangedCallback() {
    this.render();
  }

  private render() {
    if (this.entries.length === 0) {
      this.setAttribute('empty', '');
      if (!this.hasAttribute('empty-text')) this.setAttribute('empty-text', '暂无日志');
      this.container.innerHTML = '';
      return;
    }
    this.removeAttribute('empty');
    this.container.innerHTML = this.entries
      .map((entry) => {
        const level = entry.level ?? 'info';
        const time = entry.time ?? '';
        const message = String(entry.message ?? '')
          .replaceAll('&', '&amp;')
          .replaceAll('<', '&lt;')
          .replaceAll('>', '&gt;');
        return `<div class="row"><span class="time">${time}</span><span class="level" data-level="${level}">${level}</span><span class="message">${message}</span></div>`;
      })
      .join('');
  }
}
