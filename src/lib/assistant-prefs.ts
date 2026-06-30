import { useEffect, useState } from "react";

export type AssistantLang = "en" | "es";
export type AssistantUnits = "m" | "ft";

const LANG_KEY = "formai.assistant.lang";
const UNITS_KEY = "formai.assistant.units";

function read<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  if (typeof window === "undefined") return fallback;
  const v = window.localStorage.getItem(key);
  return (allowed as readonly string[]).includes(v ?? "") ? (v as T) : fallback;
}

export function useAssistantPrefs() {
  const [lang, setLangState] = useState<AssistantLang>("en");
  const [units, setUnitsState] = useState<AssistantUnits>("m");

  useEffect(() => {
    setLangState(read(LANG_KEY, ["en", "es"] as const, "en"));
    setUnitsState(read(UNITS_KEY, ["m", "ft"] as const, "m"));
    if (typeof window === "undefined") return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === LANG_KEY) setLangState(read(LANG_KEY, ["en", "es"] as const, "en"));
      if (e.key === UNITS_KEY) setUnitsState(read(UNITS_KEY, ["m", "ft"] as const, "m"));
    };
    const onLocal = () => {
      setLangState(read(LANG_KEY, ["en", "es"] as const, "en"));
      setUnitsState(read(UNITS_KEY, ["m", "ft"] as const, "m"));
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

  return { lang, units, setLang, setUnits };
}