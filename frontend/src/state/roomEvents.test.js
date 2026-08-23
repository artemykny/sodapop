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
      players: [{ id: "one", connected: true }],
    },
  });

  assert.equal(state.answer_locked, true);
  assert.equal(state.players[0].connected, true);
});
