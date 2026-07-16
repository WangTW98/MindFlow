import { canonicalFileKey } from "../../../shared/canonicalFileKey";

const flowEditQueues = new Map<string, Promise<void>>();

export function enqueueFlowDocumentEdit<TResult>(flowKey: string, task: () => Promise<TResult>): Promise<TResult> {
  const key = canonicalFileKey(flowKey);
  const previous = flowEditQueues.get(key) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(task);
  const queued = run.then(() => undefined, () => undefined);
  flowEditQueues.set(key, queued);
  void queued.then(() => {
    if (flowEditQueues.get(key) === queued) {
      flowEditQueues.delete(key);
    }
  });
  return run;
}
