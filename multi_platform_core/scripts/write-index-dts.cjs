const fs = require('node:fs');
const path = require('node:path');

const packageRoot = path.resolve(__dirname, '..');
const target = path.join(packageRoot, 'index.d.ts');

const content = `export class JsTerminalHost {
  constructor(...args: unknown[]);
  [key: string]: any;
}

export class JsDatabase {
  constructor(path: string);
  static newInMemory(): JsDatabase;
  getAllTodoLists(): Promise<Array<{ id: string }>>;
  [key: string]: any;
}

export class JsSshHost {
  constructor(db: JsDatabase);
  [key: string]: any;
}

export class JsFtpHost {
  constructor(db: JsDatabase);
  [key: string]: any;
}

export class JsMultiDeviceClipboardHost {
  constructor(db: JsDatabase);
  [key: string]: any;
}
`;

fs.writeFileSync(target, content);
