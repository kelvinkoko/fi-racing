import { useState } from "react";
import { generateRoomCode } from "../net/room";

type Props = {
  onEnter: (room: string, name: string) => void;
  onTimeTrial?: () => void;
  initialRoom?: string;
};

const NAME_KEY = "fi-racing.name";

export default function Menu({ onEnter, onTimeTrial, initialRoom = "" }: Props) {
  const [name, setName] = useState<string>(() => localStorage.getItem(NAME_KEY) ?? "");
  const [join, setJoin] = useState(initialRoom);

  function commit(room: string) {
    const cleanName = name.trim() || `Driver-${Math.floor(Math.random() * 999)}`;
    localStorage.setItem(NAME_KEY, cleanName);
    onEnter(room.toUpperCase(), cleanName);
  }

  return (
    <div className="menu">
      <div className="card">
        <h1>Fi Racing</h1>
        <div className="sub">Top-down arcade racer · 2–4 players · serverless P2P</div>

        <div className="row">
          <input
            type="text"
            placeholder="Your name"
            value={name}
            maxLength={16}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="row" style={{ marginTop: 16 }}>
          <button className="primary" onClick={() => commit(generateRoomCode())}>
            Create race
          </button>
          {onTimeTrial && (
            <button onClick={onTimeTrial}>Time trial</button>
          )}
          <div className="spacer" />
        </div>

        <div className="row" style={{ marginTop: 16 }}>
          <input
            type="text"
            placeholder="Room code"
            value={join}
            maxLength={8}
            onChange={(e) => setJoin(e.target.value.toUpperCase())}
          />
          <button onClick={() => join && commit(join)} disabled={!join}>Join</button>
        </div>

        <div className="row" style={{ marginTop: 16, color: "var(--muted)", fontSize: 13 }}>
          Or paste a friend's link. Arrow keys / WASD to drive.
        </div>
      </div>
    </div>
  );
}
