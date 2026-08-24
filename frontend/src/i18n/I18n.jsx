import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { translations } from "./translations.js";

const STORAGE_KEY = "sodapop-locale-v1";
const DEFAULT_LOCALE = "en";
const I18nContext = createContext(null);

function initialLocale() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && translations[stored]) return stored;
  } catch {
    // Browser storage is optional.
  }
  const browserLocale = navigator.language?.toLowerCase().split("-")[0];
  return translations[browserLocale] ? browserLocale : DEFAULT_LOCALE;
}

function lookup(locale, key) {
  return key.split(".").reduce((value, part) => value?.[part], translations[locale]);
}

function interpolate(value, variables) {
  return String(value).replace(/\{(\w+)\}/g, (match, name) => variables[name] ?? match);
}

export function I18nProvider({ children }) {
  const [locale, setLocale] = useState(initialLocale);

  useEffect(() => {
    document.documentElement.lang = locale;
    try { localStorage.setItem(STORAGE_KEY, locale); } catch { /* Browser storage is optional. */ }
  }, [locale]);

  const t = useCallback((key, variables = {}) => {
    const value = lookup(locale, key) ?? lookup(DEFAULT_LOCALE, key);
    return typeof value === "string" ? interpolate(value, variables) : value ?? key;
  }, [locale]);

  const plural = useCallback((key, count, variables = {}) => {
    const choices = lookup(locale, key) ?? lookup(DEFAULT_LOCALE, key);
    if (!choices || typeof choices === "string") return interpolate(choices ?? key, { ...variables, count });
    const form = new Intl.PluralRules(locale).select(count);
    return interpolate(choices[form] ?? choices.other, { ...variables, count });
  }, [locale]);

  const value = useMemo(() => ({ locale, setLocale, t, plural }), [locale, plural, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside I18nProvider");
  return value;
}

export function localizeError(error, t) {
  if (!error) return t("errors.request_failed");
  const key = `errors.${error.code || "request_failed"}`;
  const translated = t(key);
  return translated === key ? error.message || t("errors.request_failed") : translated;
}
