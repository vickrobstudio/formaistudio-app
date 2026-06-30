import { useEffect, useState } from "react";

export type AssistantLang = "en" | "es";
export type AssistantUnits = "m" | "ft";
export type AssistantRegion = "auto" | "us" | "es" | "fr" | "de" | "uk" | "it" | "eu";

export const REGION_LABELS: Record<AssistantRegion, string> = {
  auto: "Auto-detect",
  us: "United States (IBC / IRC / ADA)",
  es: "Spain (CTE)",
  fr: "France (NF / RT 2020)",
  de: "Germany (DIN / GEG)",
  uk: "United Kingdom (Approved Docs A–R)",
  it: "Italy (DM 236/89)",
  eu: "Europe (Eurocodes / ISO 21542)",
};

const REGIONS = ["auto", "us", "es", "fr", "de", "uk", "it", "eu"] as const;

const LANG_KEY = "formai.assistant.lang";
const UNITS_KEY = "formai.assistant.units";
const REGION_KEY = "formai.assistant.region";

function read<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  if (typeof window === "undefined") return fallback;
  const v = window.localStorage.getItem(key);
  return (allowed as readonly string[]).includes(v ?? "") ? (v as T) : fallback;
}

export function useAssistantPrefs() {
  const [lang, setLangState] = useState<AssistantLang>("en");
  const [units, setUnitsState] = useState<AssistantUnits>("ft");
  const [region, setRegionState] = useState<AssistantRegion>("us");

  useEffect(() => {
    setLangState(read(LANG_KEY, ["en", "es"] as const, "en"));
    setUnitsState(read(UNITS_KEY, ["m", "ft"] as const, "ft"));
    setRegionState(read(REGION_KEY, REGIONS, "us"));
    if (typeof window === "undefined") return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === LANG_KEY) setLangState(read(LANG_KEY, ["en", "es"] as const, "en"));
      if (e.key === UNITS_KEY) setUnitsState(read(UNITS_KEY, ["m", "ft"] as const, "ft"));
      if (e.key === REGION_KEY) setRegionState(read(REGION_KEY, REGIONS, "us"));
    };
    const onLocal = () => {
      setLangState(read(LANG_KEY, ["en", "es"] as const, "en"));
      setUnitsState(read(UNITS_KEY, ["m", "ft"] as const, "ft"));
      setRegionState(read(REGION_KEY, REGIONS, "us"));
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("formai:assistant-prefs", onLocal);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("formai:assistant-prefs", onLocal);
    };
  }, []);

  const setLang = (v: AssistantLang) => {
    setLangState(v);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LANG_KEY, v);
      window.dispatchEvent(new Event("formai:assistant-prefs"));
    }
  };
  const setUnits = (v: AssistantUnits) => {
    setUnitsState(v);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(UNITS_KEY, v);
      window.dispatchEvent(new Event("formai:assistant-prefs"));
    }
  };
  const setRegion = (v: AssistantRegion) => {
    setRegionState(v);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(REGION_KEY, v);
      window.dispatchEvent(new Event("formai:assistant-prefs"));
    }
  };

  return { lang, units, region, setLang, setUnits, setRegion };
}