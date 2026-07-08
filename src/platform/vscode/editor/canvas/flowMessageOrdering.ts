export function recordEdgeDetailsRevision(
  latestRevisions: Map<string, number>,
  edgeId: string,
  revision: number | undefined
): boolean {
  if (revision === undefined) {
    return true;
  }
  const latest = latestRevisions.get(edgeId) ?? 0;
  if (revision < latest) {
    return false;
  }
  latestRevisions.set(edgeId, revision);
  return true;
}
