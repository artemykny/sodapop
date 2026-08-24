import { useI18n } from "../../i18n/I18n.jsx";

export function FlowProgress({ current, steps, eyebrow, title, description }) {
  const { t } = useI18n();
  return (
    <header className="flow-header">
      <div className="flow-heading">
        <p className="kicker">{eyebrow}</p>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <ol className="flow-progress" aria-label={t("progress.label")}>
        {steps.map((label, index) => (
          <li key={label} className={index < current ? "complete" : index === current ? "active" : ""} aria-current={index === current ? "step" : undefined}>
            <span>{index < current ? "✓" : index + 1}</span>
            <small>{label}</small>
          </li>
        ))}
      </ol>
    </header>
  );
}
