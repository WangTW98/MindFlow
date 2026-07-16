import * as path from "node:path";

export const MINDFLOW_LOCAL_FILE_EXTENSION = ".mindflow";

export function assertAbsoluteLocalMindFlowPath(flowPath: string): string {
  if (!path.isAbsolute(flowPath)) {
    throw new Error("MindFlow file path must be an absolute local path.");
  }
  if (path.extname(flowPath).toLocaleLowerCase("en-US") !== MINDFLOW_LOCAL_FILE_EXTENSION) {
    throw new Error(`MindFlow file must use the ${MINDFLOW_LOCAL_FILE_EXTENSION} extension.`);
  }
  return path.normalize(flowPath);
}
