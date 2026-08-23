const incrementalEvents = new Set([
  "players_updated",
  "round_started",
  "answer_locked",
  "discussion_started",
  "voting_started",
  "vote_locked",
  "round_result",
  "game_finished",
]);

export function applyRoomEvent(state, message) {
  if (message.type === "sync") return message.payload;
  if (!state || !incrementalEvents.has(message.type)) return state;

  const payload = message.payload || {};
  if (!Number.isInteger(payload.version) || payload.version <= state.version) return state;
  const next = { ...state, version: payload.version };

  switch (message.type) {
    case "players_updated":
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
        vote_locked: false,
        real_question: undefined,
        answers: undefined,
        result: null,
      };
    case "answer_locked":
      return { ...next, answer_locked: true };
    case "discussion_started":
      return phaseState(next, "discussion", payload);
    case "voting_started":
      return phaseState(next, "voting", payload);
    case "vote_locked":
      return { ...next, vote_locked: true };
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
    deadline: payload.deadline,
    real_question: payload.real_question,
    answers: payload.answers || [],
    players: payload.players,
    your_prompt: undefined,
    answer_locked: false,
    vote_locked: false,
    result: null,
  };
}

function resultState(state, phase, payload) {
  return {
    ...state,
    phase,
    deadline: payload.deadline,
    real_question: payload.real_question,
    answers: payload.answers || [],
    result: payload.result || null,
    players: payload.players,
    your_prompt: undefined,
    answer_locked: false,
    vote_locked: false,
  };
}
