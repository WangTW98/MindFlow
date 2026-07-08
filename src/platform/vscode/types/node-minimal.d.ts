declare class Buffer extends Uint8Array {
  static byteLength(value: string): number;
  static concat(chunks: Buffer[]): Buffer;
  toString(encoding?: string): string;
}

declare const process: {
  argv: string[];
  cwd(): string;
  env: Record<string, string | undefined>;
  exitCode?: number;
  stdin: {
    setEncoding(encoding: "utf8"): void;
    on(event: "data", listener: (chunk: string) => void): void;
    on(event: "end", listener: () => void): void;
  };
  stdout: {
    write(data: string): void;
  };
  stderr: {
    write(data: string): void;
  };
};

declare module "node:crypto" {
  export function randomUUID(): string;
  export function createHash(algorithm: string): {
    update(value: string): {
      digest(encoding: "hex"): string;
    };
  };
}

declare module "node:fs" {
  export function existsSync(path: string): boolean;
  export function readFileSync(path: string, encoding: "utf8"): string;
}

declare module "node:fs/promises" {
  export interface Dirent {
    name: string;
    isDirectory(): boolean;
    isFile(): boolean;
  }
  export function mkdtemp(prefix: string): Promise<string>;
  export function mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  export function readFile(path: string, encoding: "utf8"): Promise<string>;
  export function readFile(path: string): Promise<Buffer>;
  export function writeFile(path: string, data: string, encoding?: "utf8"): Promise<void>;
  export function rename(oldPath: string, newPath: string): Promise<void>;
  export function readdir(path: string): Promise<string[]>;
  export function readdir(path: string, options: { withFileTypes: true }): Promise<Dirent[]>;
  export function rm(path: string, options?: { recursive?: boolean; force?: boolean }): Promise<void>;
  export function stat(path: string): Promise<{ mtimeMs: number }>;
}

declare module "node:path" {
  export function join(...parts: string[]): string;
  export function relative(from: string, to: string): string;
  export function basename(path: string): string;
  export function dirname(path: string): string;
  export function extname(path: string): string;
  export function isAbsolute(path: string): boolean;
  export function normalize(path: string): string;
}

declare module "node:os" {
  export function tmpdir(): string;
}

declare module "node:http" {
  export interface IncomingMessage {
    method?: string;
    url?: string;
    statusCode?: number;
    headers?: Record<string, string | string[] | undefined>;
    on(event: "data", listener: (chunk: Buffer) => void): void;
    on(event: "end", listener: () => void): void;
  }
  export interface ServerResponse {
    statusCode: number;
    setHeader(name: string, value: string): void;
    end(data?: string): void;
  }
  export interface Server {
    listen(port: number, host: string, callback?: () => void): void;
    close(callback?: (error?: Error) => void): void;
    address(): { port: number } | string | null;
    on(event: "error", listener: (error: Error) => void): void;
  }
  export interface ClientRequest {
    on(event: "error", listener: (error: Error) => void): void;
    write(body: string): void;
    end(): void;
  }
  export function createServer(
    listener: (request: IncomingMessage, response: ServerResponse) => void
  ): Server;
  export function request(
    url: URL,
    options: { method?: string; headers?: Record<string, string> },
    callback: (response: IncomingMessage) => void
  ): ClientRequest;
}

declare module "node:https" {
  export * from "node:http";
}

declare module "node:child_process" {
  export interface ChildProcess {
    kill?: () => void;
    stdin?: {
      write(data: string): void;
      end(): void;
    };
    stdout?: {
      on(event: "data", listener: (chunk: Buffer | string) => void): void;
    };
    stderr?: {
      on(event: "data", listener: (chunk: Buffer | string) => void): void;
    };
    on(event: "error", listener: (error: Error & { code?: string }) => void): void;
    on(event: "close", listener: (code: number | null) => void): void;
  }

  export function spawn(
    command: string,
    args: string[],
    options?: { cwd?: string; stdio?: Array<"pipe" | "ignore"> }
  ): ChildProcess;
}

declare module "node:assert" {
  export const strict: {
    equal(actual: unknown, expected: unknown, message?: string): void;
    deepEqual(actual: unknown, expected: unknown, message?: string): void;
    ok(value: unknown, message?: string): asserts value;
  };
}

declare module "node:test" {
  export default function test(name: string, fn: () => void | Promise<void>): void;
}
