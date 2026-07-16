declare const __MINDFLOW_VERSION__: string;

export const MINDFLOW_VERSION = typeof __MINDFLOW_VERSION__ === "string" ? __MINDFLOW_VERSION__ : "development";
