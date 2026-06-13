export const GUEST_CREDITS_KEY = "formai-guest-credits";
export const GUEST_PHOTO_CHAT_KEY = "formai-photo-chat";

export function getGuestCredits() {
  if (typeof window === "undefined") return 4;
  const stored = Number.parseInt(window.localStorage.getItem(GUEST_CREDITS_KEY) ?? "4", 10);
  return Number.isFinite(stored) ? Math.max(0, Math.min(4, stored)) : 4;
}

export function spendGuestCredit() {
  const remaining = getGuestCredits();
  if (remaining < 1) return null;
  const next = remaining - 1;
  window.localStorage.setItem(GUEST_CREDITS_KEY, String(next));
  return next;
}