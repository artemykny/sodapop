import { useEffect, useRef, useState } from "react";
import { getAdminOverview } from "../../api/client.js";

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
            <GameSection game={overview.games.find((game) => game.id === selectedGameId)} />
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

function GameSection({ game }) {
  const [openPack, setOpenPack] = useState(null);
  if (!game) return null;
  const phases = Object.entries(game.rooms.by_phase || {}).sort(([a], [b]) => a.localeCompare(b));
  return (
    <>
      <section className="admin-title admin-game-title">
        <div>
          <p className="kicker">Game · {game.id}</p>
          <h1>{game.name}</h1>
        </div>
        <p>Live activity, room phases, and content packs for this game across every server instance that hosts it.</p>
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
        <div>
          <h3>Question packs</h3>
          <ul className="admin-pack-list">
            {game.question_packs.length ? game.question_packs.map((pack) => (
              <li key={pack.id}>
                <div className="admin-pack-heading"><strong>{pack.name}</strong><code>{pack.id}</code></div>
                <p>{pack.description || "No description."}</p>
                <div className="admin-pack-footer">
                  <span className="admin-pack-count">{pack.question_count} {pack.question_count === 1 ? "item" : "items"}</span>
                  <button className="secondary-button" onClick={() => setOpenPack(pack)}>Open pack</button>
                </div>
              </li>
            )) : <p>No question packs reported.</p>}
          </ul>
        </div>
      </div>
      </section>
      {openPack && <QuestionPackModal pack={openPack} onClose={() => setOpenPack(null)} />}
    </>
  );
}

function QuestionPackModal({ pack, onClose }) {
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

  return (
    <div className="admin-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="admin-pack-modal" role="dialog" aria-modal="true" aria-labelledby="pack-modal-title">
        <header>
          <div>
            <p className="kicker">Question pack · {pack.id}</p>
            <h2 id="pack-modal-title">{pack.name}</h2>
            <p>{pack.description || "No description."}</p>
          </div>
          <button className="admin-modal-close" onClick={onClose} autoFocus aria-label="Close question pack">×</button>
        </header>
        <div className="admin-pack-modal-body">
          <p className="admin-pack-count">{pack.question_count} {pack.question_count === 1 ? "item" : "items"}</p>
          <ol className="admin-question-list">
            {pack.items.map((item, index) => (
              <li key={index}>
                <b>{index + 1}</b>
                <div>
                  {item.fields.map((field) => (
                    <p key={field.label}><span>{field.label}</span><em>{field.value}</em></p>
                  ))}
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </div>
  );
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
