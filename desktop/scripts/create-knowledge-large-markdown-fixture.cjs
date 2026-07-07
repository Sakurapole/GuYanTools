const fs = require('node:fs');
const path = require('node:path');

const lineCount = Number(process.argv[2] || 10000);
const output = process.argv[3] || path.resolve(__dirname, '..', 'tmp', `knowledge-large-${lineCount}.md`);

fs.mkdirSync(path.dirname(output), { recursive: true });

const lines = [];
for (let index = 1; index <= lineCount; index += 1) {
  if (index % 200 === 1) {
    lines.push(`# Section ${Math.ceil(index / 200)}`);
  } else if (index % 37 === 0) {
    lines.push(`- [${index % 74 === 0 ? 'x' : ' '}] Task line ${index} with [[Page ${index % 50}]]`);
  } else if (index % 53 === 0) {
    lines.push('```ts');
    lines.push(`const line${index} = ${index};`);
    lines.push('```');
  } else if (index % 89 === 0) {
    lines.push(`> [!NOTE] Callout ${index}`);
    lines.push(`> This callout tests blockquote grouping for line ${index}.`);
  } else {
    lines.push(`Paragraph line ${index} with **bold text**, *emphasis*, \`code\`, and [link](https://example.com/${index}).`);
  }
}

fs.writeFileSync(output, lines.join('\n'), 'utf8');
console.log(output);
