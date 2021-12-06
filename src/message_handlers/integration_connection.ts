import { commands, ProgressLocation, window } from "vscode";
import { getUser } from "../DataController";
import { setAuthCallbackState } from "../Util";

export async function handleIntegrationConnectionSocketEvent(body: any) {
  // integration_type_id = 14 (slack)
  // action = add, update, remove
  const { integration_type_id, integration_type, action } = body;

  if (integration_type_id === 14) {
    await getUser();

    if (action === "add") {
      // refresh the slack integrations
      // clear the auth callback state
      setAuthCallbackState(null);
      showSuccessMessage("Successfully connected to Slack");
    }

    commands.executeCommand("codetime.refreshCodeTimeView");
  }
}

function showSuccessMessage(message: string) {
  window.withProgress(
    {
      location: ProgressLocation.Notification,
      title: message,
      cancellable: false,
    },
    async (progress) => {
      setTimeout(() => {
        return true;
      }, 1000);
    }
  );
}
