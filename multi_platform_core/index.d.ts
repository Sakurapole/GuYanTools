export interface NativeTodoList {
  id: string;
  [field: string]: any;
}

export class JsTerminalHost {
  constructor(...args: any[]);
  [method: string]: any;
}

export class JsDatabase {
  constructor(...args: any[]);
  static newInMemory(): JsDatabase;
  getAllTodoLists(): Promise<NativeTodoList[]>;
  [method: string]: any;
}

export class JsSshHost {
  constructor(...args: any[]);
  [method: string]: any;
}

export class JsFtpHost {
  constructor(...args: any[]);
  [method: string]: any;
}
