import { request } from "./client";
import type {
  SystemQoLPreferencesPatch,
  SystemQoLSettings,
} from "./types";

export async function getSystemQoLSettings(): Promise<SystemQoLSettings> {
  return request<SystemQoLSettings>("/system-settings");
}

export async function updateSystemQoLSettings(
  patch: SystemQoLPreferencesPatch,
): Promise<SystemQoLSettings> {
  return request<SystemQoLSettings>("/system-settings", {
    method: "PUT",
    body: JSON.stringify(patch),
  });
}
