const STORAGE_KEY = "nps-theme";

export type ThemeChoice = "system" | "dark" | "light";

function systemPrefersDark(): boolean {
  return typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function getStoredTheme(): ThemeChoice {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "dark" || value === "light" ? value : "system";
  } catch {
    return "system";
  }
}

export function isDarkEffective(choice: ThemeChoice): boolean {
  if (choice === "dark") return true;
  if (choice === "light") return false;
  return systemPrefersDark();
}

export function applyTheme(choice: ThemeChoice): boolean {
  const dark = isDarkEffective(choice);
  document.documentElement.classList.toggle("dark", dark);
  return dark;
}

export function storeTheme(choice: ThemeChoice): void {
  try {
    localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    /* storage unavailable — theme simply won't persist */
  }
}

export function watchSystemTheme(callback: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}
