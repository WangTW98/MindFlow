interface Window {
  MindFlowCanvas: Record<string, unknown>;
  __MINDFLOW_STATE__: any;
}

declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): any;
  setState(state: unknown): void;
};

interface Element {
  checked: boolean;
  dataset: DOMStringMap;
  offsetHeight: number;
  offsetWidth: number;
  selectedOptions: HTMLCollectionOf<HTMLOptionElement>;
  setSelectionRange(start: number, end: number): void;
  style: CSSStyleDeclaration;
  value: string;
}

interface Document {
  matches(selectors: string): boolean;
}

interface EventTarget {
  checked: boolean;
  closest(selectors: string): Element | null;
  dataset: DOMStringMap;
  setSelectionRange(start: number, end: number): void;
  value: string;
}

interface Event {
  isComposing: boolean;
  key: string;
}

interface Object {
  immediate?: boolean;
  localOnly?: boolean;
  multi?: boolean;
  panelClass?: string;
  showFilters?: boolean;
}

interface ObjectConstructor {
  entries(value: any): [string, any][];
}
