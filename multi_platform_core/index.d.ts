export class JsTerminalHost {
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
