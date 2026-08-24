import { useEffect, useRef, useState } from "react";
import { deleteAdminQuestionPack, getAdminOverview, saveAdminQuestionPack } from "../../api/client.js";

const refreshMilliseconds = 15_000;

export function AdminPage() {
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
      setError(err.message);
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
          <p className="kicker">Restricted area</p>
          <h1>Admin console</h1>
          <p>Paste the administrator password. It is used only for this browser session and is never stored locally.</p>
          <form onSubmit={submit}>
            <label className="field">
              <span>Admin password</span>
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
              {busy ? "Checking…" : "Open dashboard"}<span aria-hidden="true">→</span>
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
          <span className="admin-badge">Admin</span>
        </div>
        <div className="admin-actions">
          <span>Updated {formatTime(overview.generated_at)}</span>
          <button className="secondary-button" onClick={() => load(credentialRef.current)}>Refresh</button>
          <button className="admin-logout" onClick={logout}>Lock</button>
        </div>
      </header>

      <div className="admin-layout">
        <AdminSidebar
          games={overview.games}
          selectedGameId={selectedGameId}
          onSelect={setSelectedGameId}
        />
        <div className="admin-content">
          {error && <p className="form-error" role="alert">Refresh failed: {error}</p>}
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
  return (
    <aside className="admin-sidebar">
      <nav aria-label="Admin sections">
        <p>Overview</p>
        <button
          className={!selectedGameId ? "active" : ""}
          aria-current={!selectedGameId ? "page" : undefined}
          onClick={() => onSelect("")}
        >
          <span>General</span><b>All</b>
        </button>
        <p>Games</p>
        {games.map((game) => (
          <button
            key={game.id}
            className={selectedGameId === game.id ? "active" : ""}
            aria-current={selectedGameId === game.id ? "page" : undefined}
            onClick={() => onSelect(game.id)}
          >
            <span>{game.name}</span><b>{game.rooms.active}</b>
          </button>
        ))}
        {!games.length && <span className="admin-sidebar-empty">No games reported</span>}
      </nav>
    </aside>
  );
}

function GeneralOverview({ overview }) {
  return (
    <>
      <section className="admin-title">
        <div>
          <p className="kicker">Live system state</p>
          <h1>General overview</h1>
        </div>
        <p>Read-only operational data from every configured game server. Refreshes automatically every 15 seconds.</p>
      </section>

      <section className="admin-metrics" aria-label="System totals">
        <Metric label="Game types" value={overview.totals.game_types} />
        <Metric label="Active rooms" value={overview.totals.active_rooms} accent />
        <Metric label="Connected players" value={overview.totals.connected_players} />
        <Metric
          label="Server health"
          value={`${overview.totals.server_instances - overview.totals.unavailable_servers}/${overview.totals.server_instances}`}
          warning={overview.totals.unavailable_servers > 0}
        />
      </section>

      {!overview.games.length && (
        <section className="admin-empty"><h2>No game data available</h2><p>Check the configured game-server instances below.</p></section>
      )}

      <section className="admin-instances">
        <div className="admin-section-heading">
          <div><p className="kicker">Infrastructure</p><h2>Server instances</h2></div>
          <span>{overview.instances.length} configured</span>
        </div>
        <div className="instance-list">
          {overview.instances.map((instance) => (
            <div key={instance.url} className="instance-row">
              <i className={instance.available ? "available" : "unavailable"} />
              <code>{instance.url}</code>
              <span>{instance.available ? formatGameIds(instance.game_ids) : instance.error}</span>
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
  if (!game) return null;
  const phases = Object.entries(game.rooms.by_phase || {}).sort(([a], [b]) => a.localeCompare(b));
  return (
    <>
      <section className="admin-title admin-game-title">
        <div>
          <p className="kicker">Game · {game.id}</p>
          <h1>{game.name}</h1>
        </div>
        <p>Live activity and the question catalog shared by every server instance that hosts this game.</p>
      </section>
      <section className="admin-game">
      <div className="admin-section-heading">
        <div><p className="kicker">Deployment</p><h2>Game information</h2></div>
        <span>{game.server_instances} server {game.server_instances === 1 ? "instance" : "instances"}</span>
      </div>
      <div className="game-stat-strip">
        <div><span>Active rooms</span><strong>{game.rooms.active}</strong></div>
        <div><span>Total in memory</span><strong>{game.rooms.total}</strong></div>
        <div><span>Finished</span><strong>{game.rooms.finished}</strong></div>
        <div><span>Players online</span><strong>{game.players.connected}<small> / {game.players.total}</small></strong></div>
      </div>
      <div className="admin-game-grid">
        <div>
          <h3>Room phases</h3>
          <div className="phase-list">
            {phases.length ? phases.map(([phase, count]) => (
              <div key={phase}><span>{formatLabel(phase)}</span><strong>{count}</strong></div>
            )) : <p>No rooms yet.</p>}
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
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("name");
  const [page, setPage] = useState(1);
  const [viewing, setViewing] = useState(null);
  const [editing, setEditing] = useState(null);
  const [actionError, setActionError] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = game.question_packs
    .filter((pack) => !normalizedQuery || [pack.name, pack.id, pack.description].some((value) => value?.toLowerCase().includes(normalizedQuery)))
    .sort((a, b) => sort === "size" ? b.question_count - a.question_count || a.name.localeCompare(b.name) : a.name.localeCompare(b.name));
  const pages = Math.max(1, Math.ceil(filtered.length / packPageSize));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * packPageSize, currentPage * packPageSize);

  useEffect(() => setPage(1), [query, sort]);

  async function remove(pack) {
    if (!window.confirm(`Delete “${pack.name}”? Existing rooms will keep their copied questions.`)) return false;
    setActionError("");
    try {
      await onDelete(pack.id);
      return true;
    } catch (err) {
      setActionError(err.message);
      return false;
    }
  }

  return (
    <section className="admin-pack-manager">
      <div className="admin-section-heading admin-pack-manager-heading">
        <div><p className="kicker">Content library</p><h2>Question packs</h2></div>
        <button className="primary-button" onClick={() => setEditing({ pack: emptyPack(), isNew: true })}>New pack <span aria-hidden="true">＋</span></button>
      </div>
      <div className="admin-pack-toolbar">
        <label className="admin-pack-search"><span className="visually-hidden">Search packs</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name, ID, or description…" /></label>
        <label><span>Sort</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="name">Name</option><option value="size">Most questions</option></select></label>
        <span className="admin-pack-total">{filtered.length} of {game.question_packs.length} packs</span>
      </div>
      {actionError && <p className="form-error" role="alert">{actionError}</p>}
      <div className="admin-pack-table" role="table" aria-label="Question packs">
        <div className="admin-pack-table-head" role="row"><span>Name</span><span>Description</span><span>Questions</span><span>Open</span></div>
        {visible.map((pack) => (
          <button className="admin-pack-row" key={pack.id} onClick={() => setViewing(pack)}>
            <div><strong>{pack.name}</strong><code>{pack.id}</code></div>
            <p>{pack.description || "No description"}</p>
            <span className="admin-pack-count">{pack.question_count}</span>
            <span className="admin-pack-open">Open <span aria-hidden="true">→</span></span>
          </button>
        ))}
      </div>
      {!visible.length && <div className="admin-pack-empty"><h3>{query ? "No matching packs" : "No question packs"}</h3><p>{query ? "Try a broader search." : "Create the first pack to make it available to room hosts."}</p></div>}
      {pages > 1 && <div className="admin-pagination"><button className="secondary-button" disabled={currentPage === 1} onClick={() => setPage((value) => value - 1)}>← Previous</button><span>Page {currentPage} of {pages}</span><button className="secondary-button" disabled={currentPage === pages} onClick={() => setPage((value) => value + 1)}>Next →</button></div>}
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
          <div><p className="kicker">Question pack · {pack.id}</p><h2 id="pack-modal-title">{pack.name}</h2><p>{pack.description || "No description."}</p></div>
          <button className="admin-modal-close" onClick={onClose} aria-label="Close question pack">×</button>
        </header>
        <div className="admin-pack-modal-body">
          <p className="admin-pack-count">{pack.question_count} {pack.question_count === 1 ? "pair" : "pairs"}</p>
          <ol className="admin-question-list">
            {pack.items.map((item, index) => <li key={index}><b>{index + 1}</b><div>{item.fields.map((field) => <p key={field.label}><span>{field.label}</span><em>{field.value}</em></p>)}</div></li>)}
          </ol>
        </div>
        <footer className="admin-pack-detail-footer">
          <button className="admin-danger-button" onClick={remove} disabled={busy}>{busy ? "Deleting…" : "Delete pack"}</button>
          <div><button className="secondary-button" onClick={onEdit}>Edit JSON <span aria-hidden="true">→</span></button></div>
        </footer>
      </section>
    </div>
  );
}

function QuestionPackJSONEditor({ pack, isNew, onSave, onClose }) {
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
      await onSave(parsePackJSON(json));
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="admin-pack-modal admin-pack-json-editor" role="dialog" aria-modal="true" aria-labelledby="pack-modal-title" onSubmit={submit}>
        <header>
          <div>
            <p className="kicker">{isNew ? "New question pack" : `Question pack · ${pack.id}`}</p>
            <h2 id="pack-modal-title">Edit JSON</h2>
            <p>Edit the complete pack document directly, or replace it with an imported JSON file.</p>
          </div>
          <button type="button" className="admin-modal-close" onClick={onClose} aria-label="Close question pack">×</button>
        </header>
        <div className="admin-pack-modal-body">
          <label className="admin-json-field"><span>Question pack JSON</span><textarea value={json} onChange={(event) => setJSON(event.target.value)} spellCheck="false" autoFocus /></label>
          {error && <p className="form-error" role="alert">{error}</p>}
        </div>
        <footer><div className="admin-json-file-actions"><button type="button" className="secondary-button" onClick={() => importRef.current?.click()}>Import JSON ↑</button><button type="button" className="secondary-button" onClick={() => downloadJSON(json, `${pack.id || "question-pack"}.json`)}>Export JSON ↓</button><input ref={importRef} className="visually-hidden" type="file" accept="application/json,.json" onChange={importJSON} /></div><div><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? "Saving…" : isNew ? "Create pack" : "Save changes"}<span aria-hidden="true">→</span></button></div></footer>
      </form>
    </div>
  );
}

function emptyPack() {
  return { id: "new-pack", name: "New pack", description: "", questions: [{ real: "", fake: "" }] };
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

function parsePackJSON(value) {
  let pack;
  try {
    pack = JSON.parse(value);
  } catch {
    throw new Error("JSON is invalid. Fix the syntax before saving.");
  }
  if (!pack || Array.isArray(pack) || typeof pack !== "object") throw new Error("The JSON root must be a question pack object.");
  if (typeof pack.id !== "string" || !/^[a-z0-9]+(?:[_-][a-z0-9]+)*$/.test(pack.id.trim())) throw new Error("id must use lowercase letters, numbers, hyphens, or underscores.");
  if (typeof pack.name !== "string" || !pack.name.trim()) throw new Error("name is required.");
  if (pack.description != null && typeof pack.description !== "string") throw new Error("description must be a string.");
  if (!Array.isArray(pack.questions) || !pack.questions.length) throw new Error("questions must contain at least one pair.");
  if (pack.questions.some((question) => !question || typeof question.real !== "string" || !question.real.trim() || typeof question.fake !== "string" || !question.fake.trim())) throw new Error("Every question pair must contain non-empty real and fake strings.");
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

function formatGameIds(gameIds) {
  return gameIds?.length ? gameIds.join(", ") : "No games";
}

function formatLabel(value) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "just now" : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
