export const FORMAI_OWNER_ID = "13cf24b3-daa6-4584-8ee1-a397cff9152e";
export function isFormAIOwner(user: { id?: string; email?: string | null; email_confirmed_at?: string | null } | null | undefined): boolean {
  return !!user && user.id === FORMAI_OWNER_ID && user.email?.trim().toLowerCase() === "hello@vickrob.com" && !!user.email_confirmed_at;
}
