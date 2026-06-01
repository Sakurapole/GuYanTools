import type { Extension, Range } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';

class TaskCheckboxWidget extends WidgetType {
  constructor(private readonly checked: boolean) {
    super();
  }

  eq(widget: TaskCheckboxWidget) {
    return widget.checked === this.checked;
  }

  toDOM() {
    const checkbox = document.createElement('span');
    checkbox.className = `cm-md-wysiwyg-task${this.checked ? ' cm-md-wysiwyg-task--checked' : ''}`;
    checkbox.setAttribute('aria-hidden', 'true');
    checkbox.textContent = this.checked ? '✓' : '';
    return checkbox;
  }

  ignoreEvent() {
    return false;
  }
}

function isInsideRange(from: number, to: number, ranges: Array<{ from: number; to: number }>) {
  return ranges.some((range) => (
    range.from === range.to
      ? from <= range.from && to >= range.from
      : from < range.to && to > range.from
  ));
}

function collectInlineCode(
  text: string,
  decorations: Array<Range<Decoration>>,
  base: number,
  occupied: Array<{ from: number; to: number }>,
) {
  const codePattern = /`([^`\n]+)`/g;
  for (const match of text.matchAll(codePattern)) {
    const full = match[0];
    const start = match.index ?? 0;
    const contentStart = start + 1;
    const contentEnd = start + full.length - 1;
    if (contentStart >= contentEnd) continue;

    occupied.push({ from: start, to: start + full.length });
    decorations.push(Decoration.replace({ inclusive: false }).range(base + start, base + contentStart));
    decorations.push(Decoration.mark({ class: 'cm-md-wysiwyg-inline-code' }).range(base + contentStart, base + contentEnd));
    decorations.push(Decoration.replace({ inclusive: false }).range(base + contentEnd, base + start + full.length));
  }
}

function collectStrong(
  text: string,
  decorations: Array<Range<Decoration>>,
  base: number,
  occupied: Array<{ from: number; to: number }>,
) {
  const strongPattern = /\*\*([^*\n]+)\*\*/g;
  for (const match of text.matchAll(strongPattern)) {
    const full = match[0];
    const start = match.index ?? 0;
    const contentStart = start + 2;
    const contentEnd = start + full.length - 2;
    if (contentStart >= contentEnd || isInsideRange(start, start + full.length, occupied)) continue;

    occupied.push({ from: start, to: start + full.length });
    decorations.push(Decoration.replace({ inclusive: false }).range(base + start, base + contentStart));
    decorations.push(Decoration.mark({ class: 'cm-md-wysiwyg-strong' }).range(base + contentStart, base + contentEnd));
    decorations.push(Decoration.replace({ inclusive: false }).range(base + contentEnd, base + start + full.length));
  }
}

function collectEmphasis(
  text: string,
  decorations: Array<Range<Decoration>>,
  base: number,
  occupied: Array<{ from: number; to: number }>,
) {
  const emphasisPattern = /(^|[^*])\*([^*\n]+)\*(?!\*)/g;
  for (const match of text.matchAll(emphasisPattern)) {
    const full = match[0];
    const prefixLength = match[1].length;
    const start = (match.index ?? 0) + prefixLength;
    const contentStart = start + 1;
    const contentEnd = (match.index ?? 0) + full.length - 1;
    if (contentStart >= contentEnd || isInsideRange(start, contentEnd + 1, occupied)) continue;

    occupied.push({ from: start, to: contentEnd + 1 });
    decorations.push(Decoration.replace({ inclusive: false }).range(base + start, base + contentStart));
    decorations.push(Decoration.mark({ class: 'cm-md-wysiwyg-emphasis' }).range(base + contentStart, base + contentEnd));
    decorations.push(Decoration.replace({ inclusive: false }).range(base + contentEnd, base + contentEnd + 1));
  }
}

function buildDecorations(view: EditorView, enabled: boolean): DecorationSet {
  if (!enabled) return Decoration.none;

  const decorations: Array<Range<Decoration>> = [];
  const activeRanges = view.state.selection.ranges.map((range) => ({
    from: range.from,
    to: range.to,
  }));

  for (const viewport of view.visibleRanges) {
    let position = viewport.from;
    while (position <= viewport.to) {
      const line = view.state.doc.lineAt(position);
      position = line.to + 1;

      if (isInsideRange(line.from, line.to, activeRanges)) continue;

      const text = line.text;
      const occupied: Array<{ from: number; to: number }> = [];

      const heading = /^(#{1,6})([ \t]+)/.exec(text);
      if (heading) {
        const level = heading[1].length;
        decorations.push(
          Decoration.line({
            class: `cm-md-wysiwyg-heading cm-md-wysiwyg-heading-${level}`,
          }).range(line.from),
        );
        decorations.push(Decoration.replace({ inclusive: false }).range(line.from, line.from + heading[0].length));
        occupied.push({ from: 0, to: heading[0].length });
      }

      const task = /^(\s*[-*+]\s+)\[([ xX])\]/.exec(text);
      if (task) {
        const markerStart = task[1].length;
        const markerEnd = markerStart + 3;
        decorations.push(
          Decoration.replace({
            widget: new TaskCheckboxWidget(task[2].toLowerCase() === 'x'),
            inclusive: false,
          }).range(line.from + markerStart, line.from + markerEnd),
        );
        occupied.push({ from: markerStart, to: markerEnd });
      }

      collectInlineCode(text, decorations, line.from, occupied);
      collectStrong(text, decorations, line.from, occupied);
      collectEmphasis(text, decorations, line.from, occupied);
    }
  }

  return Decoration.set(decorations, true);
}

export function markdownWysiwygDecorations(enabled: () => boolean): Extension {
  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      private isEnabled: boolean;

      constructor(view: EditorView) {
        this.isEnabled = enabled();
        this.decorations = buildDecorations(view, this.isEnabled);
      }

      update(update: ViewUpdate) {
        const nextEnabled = enabled();
        if (
          nextEnabled !== this.isEnabled ||
          update.docChanged ||
          update.viewportChanged ||
          update.selectionSet
        ) {
          this.isEnabled = nextEnabled;
          this.decorations = buildDecorations(update.view, nextEnabled);
        }
      }
    },
    {
      decorations: (value) => value.decorations,
    },
  );

  return plugin;
}
