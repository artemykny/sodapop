import { useEffect, useRef, useState } from "react";
import { useI18n } from "../../i18n/I18n.jsx";

const locales = [
  { id: "en", short: "EN", labelKey: "language.english" },
  { id: "ru", short: "RU", labelKey: "language.russian" },
];

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const current = locales.find((item) => item.id === locale) || locales[0];

  useEffect(() => {
    if (!open) return undefined;
    function handlePointerDown(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    }
    function handleKeyDown(event) {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function choose(nextLocale) {
    setLocale(nextLocale);
    setOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <div className={`language-switcher${open ? " open" : ""}`} ref={rootRef}>
      <button
        type="button"
        className="language-switcher-trigger"
        ref={triggerRef}
        aria-label={t("language.current", { language: t(current.labelKey) })}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{current.short}</span>
        <i aria-hidden="true" />
      </button>
      {open && (
        <div className="language-switcher-menu" role="listbox" aria-label={t("language.label")}>
          {locales.map((item) => (
            <button
              type="button"
              role="option"
              aria-selected={locale === item.id}
              className={locale === item.id ? "active" : ""}
              key={item.id}
              onClick={() => choose(item.id)}
            >
              <span>{item.short}</span>
              <strong>{t(item.labelKey)}</strong>
              <i aria-hidden="true">✓</i>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
