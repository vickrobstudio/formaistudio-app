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
  }, []);

  const setLang = (v: AssistantLang) => { setLangState(v); if (typeof window !== "undefined") window.localStorage.setItem(LANG_KEY, v); };
  const setUnits = (v: AssistantUnits) => { setUnitsState(v); if (typeof window !== "undefined") window.localStorage.setItem(UNITS_KEY, v); };

  return { lang, units, setLang, setUnits };
}