const flowEditQueues = new Map<string, Promise<void>>();

export function enqueueFlowDocumentEdit<TResult>(flowKey: string, task: () => Promise<TResult>): Promise<TResult> {
  const previous = flowEditQueues.get(flowKey) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(task);
  const queued = run.then(() => undefined, () => undefined);
  flowEditQueues.set(flowKey, queued);
  void queued.then(() => {
    if (flowEditQueues.get(flowKey) === queued) {
      flowEditQueues.delete(flowKey);
    }
  });
  return run;
}
