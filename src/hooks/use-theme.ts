import { useCallback, useEffect, useState } from "react";
import {
  applyTheme,
  getStoredTheme,
  isDarkEffective,
  storeTheme,
  watchSystemTheme,
  type ThemeChoice,
} from "@/lib/theme";

/** Manages the light/dark choice: persisted, system-aware, class-toggling. */
export function useTheme() {
  const [choice, setChoiceState] = useState<ThemeChoice>(() => getStoredTheme());
  const [isDark, setIsDark] = useState<boolean>(() => isDarkEffective(getStoredTheme()));

  // Apply whenever the stored choice changes.
  useEffect(() => {
    const dark = applyTheme(choice);
    setIsDark(dark);
  }, [choice]);

  // Follow the OS when the user hasn't picked a side manually.
  useEffect(() => {
    if (choice !== "system") return;
    return watchSystemTheme(() => {
      const dark = applyTheme("system");
      setIsDark(dark);
    });
  }, [choice]);

  const setChoice = useCallback((c: ThemeChoice) => {
    setChoiceState(c);
    storeTheme(c);
  }, []);

  const toggle = useCallback(() => {
    setChoice(isDarkEffective(getStoredTheme()) ? "light" : "dark");
  }, []);

  return { choice, isDark, setChoice, toggle };
}
