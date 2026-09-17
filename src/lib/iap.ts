import { ensureBillingSession } from "./billing-session";
/**
 * In-App Purchases via RevenueCat (iOS only).
 *
 * Apple requires that digital subscriptions sold inside an iOS app go through
 * Apple's In-App Purchase system. Stripe checkout would get the app rejected.
 * We use RevenueCat as the IAP wrapper because it handles receipt validation,
 * renewals, refunds, and webhooks into our database for us.
 *
 * On web, IAP is unavailable — the pricing page falls back to Stripe.
 */
import { Capacitor } from "@capacitor/core";
import { PLANS, type PlanId } from "@/lib/plans";

const IOS_API_KEY = import.meta.env.VITE_REVENUECAT_IOS_API_KEY as string | undefined;
const BUNDLE_ID = "app.formaistudio.formai";

let configured = false;
let configuredUserId: string | null = null;
let revenueCatModule: Promise<any> | null = null;

export function isNativeIOS(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
}

async function loadRevenueCat() {
  if (!isNativeIOS()) return null;
  revenueCatModule ??= import("@revenuecat/purchases-capacitor");
  return revenueCatModule;
}

/** Map our internal plan IDs to Apple product IDs in App Store Connect. */
export function applePid(planId: PlanId): string {
  return `${BUNDLE_ID}.${planId}`;
}

export async function configureIAP(): Promise<void> {
  if (!isNativeIOS()) return;
  const { user } = await ensureBillingSession();
  if (!IOS_API_KEY) {
    throw new Error("In-app purchases are not configured yet.");
  }
  const revenueCat = await loadRevenueCat();
  if (!revenueCat) return;
  const { Purchases, LOG_LEVEL } = revenueCat;
  if (configured) {
    if (configuredUserId !== user.id) {
      await Purchases.logIn({ appUserID: user.id });
      configuredUserId = user.id;
    }
    return;
  }
  await Purchases.setLogLevel({ level: LOG_LEVEL.WARN });
  await Purchases.configure({ apiKey: IOS_API_KEY, appUserID: user.id });
  configured = true;
  configuredUserId = user.id;
}

export async function purchasePlan(planId: PlanId): Promise<{ ok: true } | { ok: false; error: string; cancelled?: boolean }> {
  if (!isNativeIOS()) return { ok: false, error: "In-app purchases are only available in the iOS app." };
  try {
    await configureIAP();
    const revenueCat = await loadRevenueCat();
    if (!revenueCat) return { ok: false, error: "In-app purchases are only available in the iOS app." };
    const { Purchases } = revenueCat;
    const offerings = await Purchases.getOfferings();
    const all = offerings.all ?? {};
    let pkg: any = null;
    for (const offering of Object.values(all)) {
      const found = (offering as any).availablePackages?.find(
        (p: any) => p.product?.identifier === applePid(planId),
      );
      if (found) { pkg = found; break; }
    }
    if (!pkg) return { ok: false, error: `Product ${applePid(planId)} not found in RevenueCat offerings.` };
    await Purchases.purchasePackage({ aPackage: pkg });
    window.dispatchEvent(new Event("formai-credits-changed"));
    return { ok: true };
  } catch (e: any) {
    if (e?.userCancelled) return { ok: false, error: "Purchase cancelled.", cancelled: true };
    return { ok: false, error: e?.message ?? "Purchase failed." };
  }
}

/**
 * Real App Store prices per plan, keyed by our plan id (e.g. "$44.99").
 * Apple requires the price shown in-app to match the StoreKit product, so the
 * iOS pricing page displays these instead of our hardcoded USD numbers.
 * Returns {} off-iOS or if offerings can't be read (caller falls back).
 */
export async function getIapPriceStrings(): Promise<Partial<Record<PlanId, string>>> {
  if (!isNativeIOS()) return {};
  try {
    await configureIAP();
    const revenueCat = await loadRevenueCat();
    if (!revenueCat) return {};
    const { Purchases } = revenueCat;
    const offerings = await Purchases.getOfferings();
    const map: Partial<Record<PlanId, string>> = {};
    for (const offering of Object.values(offerings.all ?? {})) {
      for (const pkg of (offering as any).availablePackages ?? []) {
        const identifier: string | undefined = pkg.product?.identifier;
        const priceString: string | undefined = pkg.product?.priceString;
        if (!identifier || !priceString) continue;
        const plan = PLANS.find((p) => applePid(p.id) === identifier);
        if (plan) map[plan.id] = priceString;
      }
    }
    return map;
  } catch {
    return {};
  }
}

/**
 * Read the signed-in account's RevenueCat status for display only.
 * Server billing remains authoritative for tool access and credits.
 */
export async function hasActiveIapEntitlement(): Promise<boolean> {
  if (!isNativeIOS()) return false;
  try {
    await configureIAP();
    const revenueCat = await loadRevenueCat();
    if (!revenueCat) return false;
    const { Purchases } = revenueCat;
    const { customerInfo } = await Purchases.getCustomerInfo();
    return Object.keys(customerInfo?.entitlements?.active ?? {}).length > 0;
  } catch {
    return false;
  }
}

export async function restorePurchases(): Promise<{ ok: boolean; error?: string }> {
  if (!isNativeIOS()) return { ok: false, error: "Only available in the iOS app." };
  try {
    await configureIAP();
    const revenueCat = await loadRevenueCat();
    if (!revenueCat) return { ok: false, error: "Only available in the iOS app." };
    const { Purchases } = revenueCat;
    await Purchases.restorePurchases();
    window.dispatchEvent(new Event("formai-credits-changed"));
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Restore failed." };
  }
}

/** Link the RevenueCat user to the Supabase user after sign-in. */
export async function identifyIAPUser(userId: string): Promise<void> {
  if (!isNativeIOS() || !IOS_API_KEY) return;
  const { user } = await ensureBillingSession();
  if (user.id !== userId) throw new Error("The purchase account must match the signed-in account.");
  await configureIAP();
}

