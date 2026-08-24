import { useEffect, useRef, useState } from "react";

export function GameSelector({ games, value, onChange }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const optionRefs = useRef(new Map());
  const selectedGame = games.find((game) => game.id === value) || games[0];

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
    optionRefs.current.get(selectedGame.id)?.focus();
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, selectedGame.id]);

  function choose(gameId) {
    onChange(gameId);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function moveFocus(event, index) {
    let nextIndex;
    if (event.key === "ArrowDown") nextIndex = (index + 1) % games.length;
    else if (event.key === "ArrowUp") nextIndex = (index - 1 + games.length) % games.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = games.length - 1;
    else return;

    event.preventDefault();
    optionRefs.current.get(games[nextIndex].id)?.focus();
  }

  return (
    <div className={`game-menu${open ? " open" : ""}`} ref={rootRef}>
      <button
        type="button"
        className="game-menu-trigger"
        ref={triggerRef}
        aria-label={`Choose game. ${selectedGame.name} selected.`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="game-menu-current">
          <strong>{selectedGame.name}</strong>
        </span>
        <span className="game-menu-dot" aria-hidden="true">●</span>
        <span className="game-menu-chevron" aria-hidden="true" />
      </button>

      {open && (
        <div className="game-menu-popover">
          <div className="game-menu-heading">
            <strong>Choose a game</strong>
            <span>{games.length} available</span>
          </div>
          <div className="game-menu-options" role="listbox" aria-label="Games">
            {games.map((game, index) => {
              const selected = game.id === selectedGame.id;
              return (
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`game-menu-option${selected ? " selected" : ""}`}
                  key={game.id}
                  ref={(element) => {
                    if (element) optionRefs.current.set(game.id, element);
                    else optionRefs.current.delete(game.id);
                  }}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => choose(game.id)}
                  onKeyDown={(event) => moveFocus(event, index)}
                >
                  <span className="game-menu-icon" aria-hidden="true">{game.mark}</span>
                  <span className="game-menu-copy">
                    <strong>{game.name}</strong>
                    <small>{game.category} · {game.players}</small>
                  </span>
                  <span className="game-menu-check" aria-hidden="true">✓</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
