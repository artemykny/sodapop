import assert from "node:assert/strict";
import test from "node:test";

import { applyRoomEvent } from "./roomEvents.js";

const lobby = {
  version: 1,
  phase: "lobby",
  round: 0,
  players: [{ id: "one", connected: false }],
};

test("phase events recover when intermediate updates were coalesced", () => {
  const state = applyRoomEvent(lobby, {
    type: "voting_started",
    payload: {
      version: 5,
      round: 2,
      deadline: "2026-08-23T12:00:00Z",
      real_question: "Question",
      answers: [],
      players: [{ id: "one", connected: true }],
    },
  });

  assert.equal(state.phase, "voting");
  assert.equal(state.round, 2);
  assert.equal(state.players[0].connected, true);
});

test("lock events preserve a coalesced roster update", () => {
  const state = applyRoomEvent({ ...lobby, phase: "answering" }, {
    type: "answer_locked",
    payload: {
      version: 2,
      your_answer: "My answer",
      players: [{ id: "one", connected: true }],
    },
  });

  assert.equal(state.answer_locked, true);
  assert.equal(state.your_answer, "My answer");
  assert.equal(state.players[0].connected, true);

  const unlocked = applyRoomEvent(state, {
    type: "answer_unlocked",
    payload: { version: 3, players: state.players },
  });
  assert.equal(unlocked.answer_locked, false);
  assert.equal(unlocked.your_answer, undefined);
});

test("vote lock events retain only the current player's target", () => {
  const state = applyRoomEvent({ ...lobby, phase: "voting" }, {
    type: "vote_locked",
    payload: { version: 2, your_vote: "two", players: lobby.players },
  });
  assert.equal(state.vote_locked, true);
  assert.equal(state.your_vote, "two");

  const unlocked = applyRoomEvent(state, {
    type: "vote_unlocked",
    payload: { version: 3, players: lobby.players },
  });
  assert.equal(unlocked.vote_locked, false);
  assert.equal(unlocked.your_vote, undefined);
});
