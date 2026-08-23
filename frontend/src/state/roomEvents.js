const incrementalEvents = new Set([
  "players_updated",
  "settings_updated",
  "game_paused",
  "game_resumed",
  "round_started",
  "answer_locked",
  "answer_unlocked",
  "discussion_started",
  "voting_started",
  "vote_locked",
  "vote_unlocked",
  "round_result",
  "game_finished",
]);

export function applyRoomEvent(state, message) {
  if (message.type === "sync") return message.payload;
  if (!state || !incrementalEvents.has(message.type)) return state;

  const payload = message.payload || {};
  if (!Number.isInteger(payload.version) || payload.version <= state.version) return state;
  const next = {
    ...state,
    version: payload.version,
    settings: payload.settings || state.settings,
    max_rounds: payload.max_rounds ?? state.max_rounds,
    deadline: payload.deadline !== undefined ? payload.deadline : state.deadline,
    paused: payload.paused ?? state.paused,
    remaining_seconds: payload.paused === false
      ? undefined
      : (payload.remaining_seconds ?? state.remaining_seconds),
  };

  switch (message.type) {
    case "players_updated":
      return { ...next, players: payload.players };
    case "settings_updated":
      return { ...next, players: payload.players };
    case "game_paused":
    case "game_resumed":
      return { ...next, players: payload.players };
    case "round_started":
      return {
        ...next,
        phase: "answering",
        round: payload.round,
        deadline: payload.deadline,
        your_prompt: payload.your_prompt,
        players: payload.players,
        answer_locked: false,
        your_answer: undefined,
        vote_locked: false,
        your_vote: undefined,
        real_question: undefined,
        answers: undefined,
        result: null,
      };
    case "answer_locked":
      return { ...next, answer_locked: true, your_answer: payload.your_answer, players: payload.players };
    case "answer_unlocked":
      return { ...next, answer_locked: false, your_answer: undefined, players: payload.players };
    case "discussion_started":
      return phaseState(next, "discussion", payload);
    case "voting_started":
      return phaseState(next, "voting", payload);
    case "vote_locked":
      return { ...next, vote_locked: true, your_vote: payload.your_vote, players: payload.players };
    case "vote_unlocked":
      return { ...next, vote_locked: false, your_vote: undefined, players: payload.players };
    case "round_result":
      return resultState(next, "round_result", payload);
    case "game_finished":
      return resultState(next, "finished", payload);
    default:
      return state;
  }
}

function phaseState(state, phase, payload) {
  return {
    ...state,
    phase,
    round: payload.round,
    deadline: payload.deadline,
    real_question: payload.real_question,
    answers: payload.answers || [],
    players: payload.players,
    your_prompt: undefined,
    answer_locked: false,
    your_answer: undefined,
    vote_locked: false,
    your_vote: undefined,
    result: null,
  };
}

function resultState(state, phase, payload) {
  return {
    ...state,
    phase,
    round: payload.round,
    deadline: payload.deadline,
    real_question: payload.real_question,
    answers: payload.answers || [],
    result: payload.result || null,
    players: payload.players,
    your_prompt: undefined,
    answer_locked: false,
    your_answer: undefined,
    vote_locked: false,
    your_vote: undefined,
  };
}
