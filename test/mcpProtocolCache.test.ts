import { strict as assert } from "node:assert";
import test from "node:test";
import { MindFlowMcpProtocolCache } from "../src/platform/mcp/protocol/protocolCache";

test("MCP protocol cache reuses active clients and bounds idle client state", () => {
  let now = 0;
  let created = 0;
  const cache = new MindFlowMcpProtocolCache<{ id: number }>(2, 100, () => now);
  const make = (): { id: number } => ({ id: ++created });

  const first = cache.get("a", make);
  assert.equal(cache.get("a", make), first);
  now = 1;
  cache.get("b", make);
  now = 2;
  cache.get("c", make);
  assert.equal(cache.size, 2);
  assert.notEqual(cache.get("a", make), first, "oldest client must be evicted at capacity");

  now = 1000;
  cache.get("fresh", make);
  assert.equal(cache.size, 1, "idle clients must expire");
  cache.clear();
  assert.equal(cache.size, 0);
});
