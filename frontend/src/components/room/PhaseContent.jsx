import { Answering } from "./phases/Answering.jsx";
import { Discussion } from "./phases/Discussion.jsx";
import { Finished } from "./phases/Finished.jsx";
import { Lobby } from "./phases/Lobby.jsx";
import { RoundResult } from "./phases/RoundResult.jsx";
import { Voting } from "./phases/Voting.jsx";

export function PhaseContent({ state, me, isHost, send, copyInvite, leave }) {
  switch (state.phase) {
    case "answering": return <Answering state={state} send={send} isHost={isHost} />;
    case "discussion": return <Discussion state={state} send={send} isHost={isHost} />;
    case "voting": return <Voting state={state} me={me} send={send} isHost={isHost} />;
    case "round_result": return <RoundResult state={state} send={send} isHost={isHost} />;
    case "finished": return <Finished state={state} leave={leave} />;
    default: return <Lobby state={state} isHost={isHost} send={send} copyInvite={copyInvite} />;
  }
}
