import { useEffect, useRef, useState } from "react";
import { deleteAdminQuestionPack, getAdminOverview, saveAdminQuestionPack } from "../../api/client.js";
import { localizeError, useI18n } from "../../i18n/I18n.jsx";

const refreshMilliseconds = 15_000;

export function AdminPage() {
  const { locale, t } = useI18n();
  const credentialRef = useRef("");
  const [password, setPassword] = useState("");
  const [overview, setOverview] = useState(null);
  const [selectedGameId, setSelectedGameId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load(credential, showBusy = true) {
    if (showBusy) setBusy(true);
    setError("");
    try {
      const result = await getAdminOverview(credential);
      credentialRef.current = credential;
      setPassword("");
      setOverview(result);
    } catch (err) {
      setError(localizeError(err, t));
    } finally {
      if (showBusy) setBusy(false);
    }
  }

  useEffect(() => {
    if (!overview) return undefined;
    const timer = window.setInterval(() => load(credentialRef.current, false), refreshMilliseconds);
    return () => window.clearInterval(timer);
  }, [Boolean(overview)]);

  useEffect(() => {
    if (selectedGameId && overview && !overview.games.some((game) => game.id === selectedGameId)) {
      setSelectedGameId("");
    }
  }, [overview, selectedGameId]);

  function submit(event) {
    event.preventDefault();
    load(password);
  }

  function logout() {
    credentialRef.current = "";
    setOverview(null);
    setSelectedGameId("");
    setPassword("");
    setError("");
  }

  async function savePack(pack) {
    await saveAdminQuestionPack(credentialRef.current, pack);
    await load(credentialRef.current, false);
  }

  async function deletePack(packId) {
    await deleteAdminQuestionPack(credentialRef.current, packId);
    await load(credentialRef.current, false);
  }

  if (!overview) {
    return (
      <main className="admin-login">
        <section className="admin-login-card">
          <a className="wordmark wordmark-dark" href="/">SODAPOP<span>●</span></a>
          <p className="kicker">{t("admin.restricted")}</p>
          <h1>{t("admin.console")}</h1>
          <p>{t("admin.loginHelp")}</p>
          <form onSubmit={submit}>
            <label className="field">
              <span>{t("admin.password")}</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                autoFocus
                required
              />
            </label>
            <button className="primary-button" disabled={busy || !password}>
              {t(busy ? "admin.checking" : "admin.openDashboard")}<span aria-hidden="true">→</span>
            </button>
          </form>
          {error && <p className="form-error" role="alert">{error}</p>}
        </section>
      </main>
    );
  }

  return (
    <main className="admin-page">
      <header className="admin-header">
        <div>
          <a className="wordmark wordmark-light" href="/">SODAPOP<span>●</span></a>
          <span className="admin-badge">{t("admin.badge")}</span>
        </div>
        <div className="admin-actions">
          <span>{t("admin.updated", { time: formatTime(overview.generated_at, locale, t) })}</span>
          <button className="secondary-button" onClick={() => load(credentialRef.current)}>{t("admin.refresh")}</button>
          <button className="admin-logout" onClick={logout}>{t("admin.lock")}</button>
        </div>
      </header>

      <div className="admin-layout">
        <AdminSidebar
          games={overview.games}
          selectedGameId={selectedGameId}
          onSelect={setSelectedGameId}
        />
        <div className="admin-content">
          {error && <p className="form-error" role="alert">{t("admin.refreshFailed", { error })}</p>}
          {selectedGameId ? (
            <GameSection
              game={overview.games.find((game) => game.id === selectedGameId)}
              onSavePack={savePack}
              onDeletePack={deletePack}
            />
          ) : (
            <GeneralOverview overview={overview} />
          )}
        </div>
      </div>
    </main>
  );
}

function AdminSidebar({ games, selectedGameId, onSelect }) {
  const { t } = useI18n();
  return (
    <aside className="admin-sidebar">
      <nav aria-label={t("admin.sections")}>
        <p>{t("admin.overview")}</p>
        <button
          className={!selectedGameId ? "active" : ""}
          aria-current={!selectedGameId ? "page" : undefined}
          onClick={() => onSelect("")}
        >
          <span>{t("admin.general")}</span><b>{t("admin.all")}</b>
        </button>
        <p>{t("admin.games")}</p>
        {games.map((game) => (
          <button
            key={game.id}
            className={selectedGameId === game.id ? "active" : ""}
            aria-current={selectedGameId === game.id ? "page" : undefined}
            onClick={() => onSelect(game.id)}
          >
            <span>{gameDisplayName(game, t)}</span><b>{game.rooms.active}</b>
          </button>
        ))}
        {!games.length && <span className="admin-sidebar-empty">{t("admin.noGamesReported")}</span>}
      </nav>
    </aside>
  );
}

function GeneralOverview({ overview }) {
  const { t } = useI18n();
  return (
    <>
      <section className="admin-title">
        <div>
          <p className="kicker">{t("admin.liveState")}</p>
          <h1>{t("admin.generalOverview")}</h1>
        </div>
        <p>{t("admin.overviewHelp")}</p>
      </section>

      <section className="admin-metrics" aria-label={t("admin.systemTotals")}>
        <Metric label={t("admin.gameTypes")} value={overview.totals.game_types} />
        <Metric label={t("admin.activeRooms")} value={overview.totals.active_rooms} accent />
        <Metric label={t("admin.connectedPlayers")} value={overview.totals.connected_players} />
        <Metric
          label={t("admin.serverHealth")}
          value={`${overview.totals.server_instances - overview.totals.unavailable_servers}/${overview.totals.server_instances}`}
          warning={overview.totals.unavailable_servers > 0}
        />
      </section>

      {!overview.games.length && (
        <section className="admin-empty"><h2>{t("admin.noGameData")}</h2><p>{t("admin.noGameDataHelp")}</p></section>
      )}

      <section className="admin-instances">
        <div className="admin-section-heading">
          <div><p className="kicker">{t("admin.infrastructure")}</p><h2>{t("admin.serverInstances")}</h2></div>
          <span>{t("admin.configured", { count: overview.instances.length })}</span>
        </div>
        <div className="instance-list">
          {overview.instances.map((instance) => (
            <div key={instance.url} className="instance-row">
              <i className={instance.available ? "available" : "unavailable"} />
              <code>{instance.url}</code>
              <span>{instance.available ? formatGameIds(instance.game_ids, t) : instance.error}</span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function Metric({ label, value, accent = false, warning = false }) {
  return <div className={`admin-metric ${accent ? "accent" : ""} ${warning ? "warning" : ""}`}><span>{label}</span><strong>{value}</strong></div>;
}

function GameSection({ game, onSavePack, onDeletePack }) {
  const { plural, t } = useI18n();
  if (!game) return null;
  const phases = Object.entries(game.rooms.by_phase || {}).sort(([a], [b]) => a.localeCompare(b));
  return (
    <>
      <section className="admin-title admin-game-title">
        <div>
          <p className="kicker">{t("admin.gameKicker", { id: game.id })}</p>
          <h1>{gameDisplayName(game, t)}</h1>
        </div>
        <p>{t("admin.gameHelp")}</p>
      </section>
      <section className="admin-game">
      <div className="admin-section-heading">
        <div><p className="kicker">{t("admin.deployment")}</p><h2>{t("admin.gameInformation")}</h2></div>
        <span>{plural("admin.instances", game.server_instances)}</span>
      </div>
      <div className="game-stat-strip">
        <div><span>{t("admin.activeRooms")}</span><strong>{game.rooms.active}</strong></div>
        <div><span>{t("admin.totalMemory")}</span><strong>{game.rooms.total}</strong></div>
        <div><span>{t("admin.finished")}</span><strong>{game.rooms.finished}</strong></div>
        <div><span>{t("admin.playersOnline")}</span><strong>{game.players.connected}<small> / {game.players.total}</small></strong></div>
      </div>
      <div className="admin-game-grid">
        <div>
          <h3>{t("admin.roomPhases")}</h3>
          <div className="phase-list">
            {phases.length ? phases.map(([phase, count]) => (
              <div key={phase}><span>{t(`room.phases.${phase}.name`)}</span><strong>{count}</strong></div>
            )) : <p>{t("admin.noRooms")}</p>}
          </div>
        </div>
      </div>
      </section>
      <QuestionPackManager game={game} onSave={onSavePack} onDelete={onDeletePack} />
    </>
  );
}

const packPageSize = 12;

function QuestionPackManager({ game, onSave, onDelete }) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("name");
  const [page, setPage] = useState(1);
  const [viewing, setViewing] = useState(null);
  const [editing, setEditing] = useState(null);
  const [actionError, setActionError] = useState("");
  const packs = game.question_packs || [];
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = packs
    .filter((pack) => !normalizedQuery || [pack.name, pack.id, pack.description].some((value) => value?.toLowerCase().includes(normalizedQuery)))
    .sort((a, b) => sort === "size" ? b.question_count - a.question_count || a.name.localeCompare(b.name) : a.name.localeCompare(b.name));
  const pages = Math.max(1, Math.ceil(filtered.length / packPageSize));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * packPageSize, currentPage * packPageSize);

  useEffect(() => setPage(1), [query, sort]);

  async function remove(pack) {
    if (!window.confirm(t("admin.deleteConfirm", { name: pack.name }))) return false;
    setActionError("");
    try {
      await onDelete(pack.id);
      return true;
    } catch (err) {
      setActionError(localizeError(err, t));
      return false;
    }
  }

  return (
    <section className="admin-pack-manager">
      <div className="admin-section-heading admin-pack-manager-heading">
        <div><p className="kicker">{t("admin.contentLibrary")}</p><h2>{t("admin.questionPacks")}</h2></div>
        <button className="primary-button" onClick={() => setEditing({ pack: emptyPack(t), isNew: true })}>{t("admin.newPack")} <span aria-hidden="true">＋</span></button>
      </div>
      <div className="admin-pack-toolbar">
        <label className="admin-pack-search"><span className="visually-hidden">{t("admin.searchPacks")}</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("admin.searchPlaceholder")} /></label>
        <label><span>{t("admin.sort")}</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="name">{t("admin.name")}</option><option value="size">{t("admin.mostQuestions")}</option></select></label>
        <span className="admin-pack-total">{t("admin.packTotal", { visible: filtered.length, total: packs.length })}</span>
      </div>
      {actionError && <p className="form-error" role="alert">{actionError}</p>}
      <div className="admin-pack-table" role="table" aria-label={t("admin.questionPacks")}>
        <div className="admin-pack-table-head" role="row"><span>{t("admin.name")}</span><span>{t("admin.description")}</span><span>{t("admin.questions")}</span><span>{t("admin.open")}</span></div>
        {visible.map((pack) => (
          <button className="admin-pack-row" key={pack.id} onClick={() => setViewing(pack)}>
            <div><strong>{pack.name}</strong><code>{pack.id}</code></div>
            <p>{pack.description || t("admin.noDescription")}</p>
            <span className="admin-pack-count">{pack.question_count}</span>
            <span className="admin-pack-open">{t("admin.open")} <span aria-hidden="true">→</span></span>
          </button>
        ))}
      </div>
      {!visible.length && <div className="admin-pack-empty"><h3>{t(query ? "admin.noMatchingPacks" : "admin.noQuestionPacks")}</h3><p>{t(query ? "admin.broaderSearch" : "admin.createFirstPack")}</p></div>}
      {pages > 1 && <div className="admin-pagination"><button className="secondary-button" disabled={currentPage === 1} onClick={() => setPage((value) => value - 1)}>← {t("admin.previous")}</button><span>{t("admin.page", { current: currentPage, total: pages })}</span><button className="secondary-button" disabled={currentPage === pages} onClick={() => setPage((value) => value + 1)}>{t("admin.next")} →</button></div>}
      {viewing && <QuestionPackDetails
        pack={viewing}
        onClose={() => setViewing(null)}
        onEdit={() => { setEditing({ pack: viewing, isNew: false }); setViewing(null); }}
        onDelete={async () => { if (await remove(viewing)) setViewing(null); }}
      />}
      {editing && <QuestionPackJSONEditor pack={editing.pack} isNew={editing.isNew} onSave={onSave} onClose={() => setEditing(null)} />}
    </section>
  );
}

function QuestionPackDetails({ pack, onClose, onEdit, onDelete }) {
  const { plural, t } = useI18n();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function closeOnEscape(event) { if (event.key === "Escape") onClose(); }
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  async function remove() {
    setBusy(true);
    await onDelete();
    setBusy(false);
  }

  return (
    <div className="admin-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="admin-pack-modal" role="dialog" aria-modal="true" aria-labelledby="pack-modal-title">
        <header>
          <div><p className="kicker">{t("admin.questionPackKicker", { id: pack.id })}</p><h2 id="pack-modal-title">{pack.name}</h2><p>{pack.description || t("admin.noDescription")}</p></div>
          <button className="admin-modal-close" onClick={onClose} aria-label={t("admin.closePack")}>×</button>
        </header>
        <div className="admin-pack-modal-body">
          <p className="admin-pack-count">{plural("admin.pairs", pack.question_count)}</p>
          <ol className="admin-question-list">
            {pack.items.map((item, index) => <li key={index}><b>{index + 1}</b><div>{item.fields.map((field) => <p key={field.label}><span>{translateFieldLabel(field.label, t)}</span><em>{field.value}</em></p>)}</div></li>)}
          </ol>
        </div>
        <footer className="admin-pack-detail-footer">
          <button className="admin-danger-button" onClick={remove} disabled={busy}>{t(busy ? "admin.deleting" : "admin.deletePack")}</button>
          <div><button className="secondary-button" onClick={onEdit}>{t("admin.editJSON")} <span aria-hidden="true">→</span></button></div>
        </footer>
      </section>
    </div>
  );
}

function QuestionPackJSONEditor({ pack, isNew, onSave, onClose }) {
  const { t } = useI18n();
  const importRef = useRef(null);
  const [json, setJSON] = useState(() => serializePack(pack));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function closeOnEscape(event) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  async function importJSON(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setJSON(await file.text());
    setError("");
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSave(parsePackJSON(json, t));
      onClose();
    } catch (err) {
      setError(err.code ? localizeError(err, t) : err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="admin-pack-modal admin-pack-json-editor" role="dialog" aria-modal="true" aria-labelledby="pack-modal-title" onSubmit={submit}>
        <header>
          <div>
            <p className="kicker">{isNew ? t("admin.newQuestionPack") : t("admin.questionPackKicker", { id: pack.id })}</p>
            <h2 id="pack-modal-title">{t("admin.editJSON")}</h2>
            <p>{t("admin.editHelp")}</p>
          </div>
          <button type="button" className="admin-modal-close" onClick={onClose} aria-label={t("admin.closePack")}>×</button>
        </header>
        <div className="admin-pack-modal-body">
          <label className="admin-json-field"><span>{t("admin.packJSON")}</span><textarea value={json} onChange={(event) => setJSON(event.target.value)} spellCheck="false" autoFocus /></label>
          {error && <p className="form-error" role="alert">{error}</p>}
        </div>
        <footer><div className="admin-json-file-actions"><button type="button" className="secondary-button" onClick={() => importRef.current?.click()}>{t("admin.importJSON")} ↑</button><button type="button" className="secondary-button" onClick={() => downloadJSON(json, `${pack.id || "question-pack"}.json`)}>{t("admin.exportJSON")} ↓</button><input ref={importRef} className="visually-hidden" type="file" accept="application/json,.json" onChange={importJSON} /></div><div><button type="button" className="secondary-button" onClick={onClose}>{t("common.cancel")}</button><button className="primary-button" disabled={busy}>{t(busy ? "admin.saving" : isNew ? "admin.createPack" : "admin.saveChanges")}<span aria-hidden="true">→</span></button></div></footer>
      </form>
    </div>
  );
}

function emptyPack(t) {
  return { id: "new-pack", name: t("admin.defaultPackName"), description: "", questions: [{ real: "", fake: "" }] };
}

function packDocument(pack) {
  return {
    id: pack.id,
    name: pack.name,
    description: pack.description || "",
    questions: pack.questions?.map((question) => ({ real: question.real, fake: question.fake })) || pack.items.map((item) => ({
      real: item.fields.find((field) => field.label === "Question")?.value || "",
      fake: item.fields.find((field) => field.label === "Odd question")?.value || "",
    })),
  };
}

function serializePack(pack) {
  return `${JSON.stringify(packDocument(pack), null, 2)}\n`;
}

function parsePackJSON(value, t) {
  let pack;
  try {
    pack = JSON.parse(value);
  } catch {
    throw new Error(t("admin.validation.invalidJSON"));
  }
  if (!pack || Array.isArray(pack) || typeof pack !== "object") throw new Error(t("admin.validation.root"));
  if (typeof pack.id !== "string" || !/^[a-z0-9]+(?:[_-][a-z0-9]+)*$/.test(pack.id.trim())) throw new Error(t("admin.validation.id"));
  if (typeof pack.name !== "string" || !pack.name.trim()) throw new Error(t("admin.validation.name"));
  if (pack.description != null && typeof pack.description !== "string") throw new Error(t("admin.validation.description"));
  if (!Array.isArray(pack.questions) || !pack.questions.length) throw new Error(t("admin.validation.questions"));
  if (pack.questions.some((question) => !question || typeof question.real !== "string" || !question.real.trim() || typeof question.fake !== "string" || !question.fake.trim())) throw new Error(t("admin.validation.pair"));
  return {
    id: pack.id.trim(), name: pack.name.trim(), description: (pack.description || "").trim(),
    questions: pack.questions.map((question) => ({ real: question.real.trim(), fake: question.fake.trim() })),
  };
}

function downloadJSON(value, filename) {
  const url = URL.createObjectURL(new Blob([value.endsWith("\n") ? value : `${value}\n`], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function formatGameIds(gameIds, t) {
  return gameIds?.length ? gameIds.join(", ") : t("admin.noGames");
}

function gameDisplayName(game, t) {
  return game.id === "oddoneout" ? t("game.oddoneout.name") : game.name;
}

function translateFieldLabel(label, t) {
  if (label === "Question") return t("admin.fieldQuestion");
  if (label === "Odd question") return t("admin.fieldOddQuestion");
  return label;
}

function formatTime(value, locale, t) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? t("admin.justNow") : date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
