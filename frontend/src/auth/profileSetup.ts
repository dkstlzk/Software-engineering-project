const PROFILE_SETUP_REQUIRED_USER_ID_KEY = "profileSetupRequiredUserId";

function readRequiredUserId(): number | null {
  const raw = localStorage.getItem(PROFILE_SETUP_REQUIRED_USER_ID_KEY);

  if (!raw) {
    return null;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

export function markProfileSetupRequired(userId: number): void {
  localStorage.setItem(PROFILE_SETUP_REQUIRED_USER_ID_KEY, String(userId));
}

export function clearProfileSetupRequired(userId?: number): void {
  if (userId === undefined) {
    localStorage.removeItem(PROFILE_SETUP_REQUIRED_USER_ID_KEY);
    return;
  }

  const requiredUserId = readRequiredUserId();
  if (requiredUserId === userId) {
    localStorage.removeItem(PROFILE_SETUP_REQUIRED_USER_ID_KEY);
  }
}

export function isProfileSetupRequiredForUser(userId: number | null | undefined): boolean {
  if (!userId) {
    return false;
  }

  return readRequiredUserId() === userId;
}
