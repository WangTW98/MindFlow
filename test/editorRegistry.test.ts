import { strict as assert } from "node:assert";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import type * as vscode from "vscode";
import { createEmptyProductFlow } from "../src/product-flow/domain/model/factory";
import { emptyFlowSelection, type FlowSelectionState } from "../src/product-flow/domain/selection";
import { FlowEditorRegistry, type RenderableFlowEditorSession } from "../src/platform/vscode/editor/FlowEditorRegistry";

test("FlowEditorRegistry keeps multiple panels for one document and broadcasts selection", () => {
  const registry = new FlowEditorRegistry();
  const uri = fakeUri("file:///workspace/test.mindflow");
  const document = { uri } as vscode.TextDocument;
  const first = new FakeSession();
  const second = new FakeSession();

  registry.register(uri, document, first);
  registry.register(uri, document, second);
  registry.setActive(uri);
  const selection: FlowSelectionState = { ...emptyFlowSelection(), selectedNodeId: "node_a", selectedNodeIds: ["node_a"] };
  registry.applySelection(uri, selection);

  assert.equal(registry.getOpenEditorSessions().length, 1);
  assert.equal(registry.hasSession(uri), true);
  assert.deepEqual(first.selections, [selection]);
  assert.deepEqual(second.selections, [selection]);
  assert.equal(registry.remove(uri, first), false);
  assert.equal(registry.hasSession(uri), true);
  assert.equal(registry.remove(uri, second), true);
  assert.equal(registry.hasSession(uri), false);
});

test("FlowEditorRegistry renders all panels and reveals only the first", () => {
  const registry = new FlowEditorRegistry();
  const uri = fakeUri("file:///workspace/test.mindflow");
  const document = { uri } as vscode.TextDocument;
  const first = new FakeSession();
  const second = new FakeSession();
  const flow = createEmptyProductFlow();

  registry.register(uri, document, first);
  registry.register(uri, document, second);

  assert.equal(registry.renderSession(uri, flow), true);
  assert.equal(first.renderCount, 1);
  assert.equal(second.renderCount, 1);
  assert.equal(first.revealCount + second.revealCount, 1);
});

test("FlowEditorRegistry delegates DOM layout reads and broadcasts non-selecting reveals", async () => {
  const registry = new FlowEditorRegistry();
  const uri = fakeUri("file:///workspace/test.mindflow");
  const document = { uri } as vscode.TextDocument;
  const first = new FakeSession();
  const second = new FakeSession();
  registry.register(uri, document, first);
  registry.register(uri, document, second);

  assert.deepEqual(await registry.requestAutoLayout(uri), first.layoutPreview);
  const targets = [{ kind: "node" as const, id: "node_a" }, { kind: "appSurface" as const, id: "app_web" }];
  assert.equal(registry.revealEntities(uri, targets, false), true);
  assert.deepEqual(first.revealTargets, [{ targets, animate: false }]);
  assert.deepEqual(second.revealTargets, [{ targets, animate: false }]);
  assert.equal(first.selections.length + second.selections.length, 0);
  assert.equal(first.revealCount + second.revealCount, 1);
});

test("FlowEditorRegistry treats a symlink alias as the same open editor", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "mindflow-editor-key-"));
  try {
    const physicalPath = path.join(directory, "physical.mindflow");
    const aliasPath = path.join(directory, "alias.mindflow");
    await fs.writeFile(physicalPath, "{}", "utf8");
    await fs.symlink(physicalPath, aliasPath);
    const registry = new FlowEditorRegistry();
    const physicalUri = fileUri(physicalPath);
    const aliasUri = fileUri(aliasPath);
    const document = { uri: physicalUri } as vscode.TextDocument;
    const session = new FakeSession();

    registry.register(physicalUri, document, session);
    assert.equal(registry.hasSession(aliasUri), true);
    assert.equal(registry.getOpenFlowUri(aliasUri)?.toString(), physicalUri.toString());
    assert.equal(registry.revealSession(aliasUri), true);
    assert.equal(session.revealCount, 1);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

class FakeSession implements RenderableFlowEditorSession {
  public readonly selections: FlowSelectionState[] = [];
  public readonly revealTargets: Array<{ targets: Array<{ kind: "projectOverview" | "appSurface" | "node"; id: string }>; animate?: boolean }> = [];
  public readonly layoutPreview = {
    projectOverviewPosition: { x: 0, y: 0 },
    appSurfacePositions: { app_web: { x: 400, y: 0 } },
    nodePositions: { node_a: { x: 800, y: 0 } }
  };
  public renderCount = 0;
  public revealCount = 0;

  public renderWithFallback(): void {
    this.renderCount += 1;
  }

  public applySelection(selection: FlowSelectionState): void {
    this.selections.push(selection);
  }

  public async requestAutoLayout() {
    return this.layoutPreview;
  }

  public revealEntities(targets: Array<{ kind: "projectOverview" | "appSurface" | "node"; id: string }>, animate?: boolean): void {
    this.revealTargets.push({ targets, animate });
  }

  public reveal(): void {
    this.revealCount += 1;
  }
}

function fakeUri(value: string): vscode.Uri {
  return { toString: () => value } as vscode.Uri;
}

function fileUri(value: string): vscode.Uri {
  return { scheme: "file", fsPath: value, toString: () => pathToFileURL(value).toString() } as vscode.Uri;
}
