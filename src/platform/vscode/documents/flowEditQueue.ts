import { canonicalFileKey } from "../../../shared/canonicalFileKey";

const flowEditQueues = new Map<string, Promise<void>>();

export function enqueueFlowDocumentEdit<TResult>(flowKey: string, task: () => Promise<TResult>, timeoutMs = 30_000): Promise<TResult> {
  const key = canonicalFileKey(flowKey);
  const previous = flowEditQueues.get(key) ?? Promise.resolve();
  const runWithTimeout = () => new Promise<TResult>((resolve, reject) => {
    let timer: NodeJS.Timeout | undefined;
    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        reject(new Error(`MindFlow document edit queue timed out after ${timeoutMs}ms.`));
      }, timeoutMs);
    }
    task().then(
      (value) => {
        if (timer) clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        if (timer) clearTimeout(timer);
        reject(error);
      }
    );
  });
  const run = previous.catch(() => undefined).then(runWithTimeout);
  const queued = run.then(() => undefined, () => undefined);
  flowEditQueues.set(key, queued);
  void queued.then(() => {
    if (flowEditQueues.get(key) === queued) {
      flowEditQueues.delete(key);
    }
  });
  return run;
}
