import * as vscode from "vscode";
import { updateProjectOverview, updateProjectOverviewPosition, type UpdateProjectOverviewInput } from "../../../core/projectOverview";
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
    edit: (flow) => updateProjectOverviewPosition(flow, coordinates.x, coordinates.y)
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
    edit: (flow) => updateProjectOverview(flow, patch),
    afterSave: (flow, flowUri) => {
      selectAndRevealFlow(context, flow, flowUri, { selectedProjectOverview: true });
    }
  });
}
