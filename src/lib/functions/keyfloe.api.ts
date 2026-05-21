import { invoke } from "@tauri-apps/api/core";
import { safeLocalStorage } from "../storage";
import { STORAGE_KEYS } from "@/config";

// Helper function to check if Keyfloe API should be used
export async function shouldUseKeyfloeAPI(): Promise<boolean> {
  try {
    // Check if Keyfloe API is enabled in localStorage
    const keyfloeApiEnabled =
      safeLocalStorage.getItem(STORAGE_KEYS.KEYFLOE_API_ENABLED) === "true";
    if (!keyfloeApiEnabled) return false;

    // Check if license is available
    const hasLicense = await invoke<boolean>("check_license_status");
    return hasLicense;
  } catch (error) {
    console.warn("Failed to check Keyfloe API availability:", error);
    return false;
  }
}
