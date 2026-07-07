import * as vscode from "vscode";
import type { UpdateProjectOverviewInput } from "../../../core/projectOverview";
import { isPlainObject, readFiniteCoordinates } from "../guards";
import type { FlowUriArgument } from "../../flowContext";
import { applyCanvasEdit, selectAndRevealFlow } from "./editSession";

export async function saveProjectOverviewPosition(x?: number, y?: number, sourceUri?: FlowUriArgument): Promise<boolean> {
  const coordinates = readFiniteCoordinates(x, y);
  if (!coordinates) {
    return false;
  }
  return applyCanvasEdit({
    sourceUri,
    errorLabel: "Update project overview position failed",
    operation: () => ({ type: "project.move", x: coordinates.x, y: coordinates.y })
  });
}

export async function updateProjectOverviewDetails(
  context: vscode.ExtensionContext,
  patch?: UpdateProjectOverviewInput,
  sourceUri?: FlowUriArgument
): Promise<boolean> {
  if (!isPlainObject<UpdateProjectOverviewInput>(patch)) {
    return false;
  }
  return applyCanvasEdit({
    sourceUri,
    errorLabel: "Update project overview failed",
    operation: () => ({ type: "project.update", patch }),
    afterSave: (flow, flowUri) => {
      selectAndRevealFlow(context, flow, flowUri, { selectedProjectOverview: true });
    }
  });
}
