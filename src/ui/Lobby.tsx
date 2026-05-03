import { useEffect, useState } from "react";
import { NetRoom } from "../net/room";
import { CAR_COLORS, LobbyMsg } from "../net/protocol";

type Props = {
  net: NetRoom;
  onStart: () => void;
  onLeave: () => void;
};

export default function Lobby({ net, onStart, onLeave }: Props) {
  const [lobby, setLobby] = useState<LobbyMsg>(() => net.snapshotLobby());
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    net.on({ onLobby: setLobby });
    net.broadcastHello();
    const off = net.onStartPersistent(() => onStart());
    return off;
  }, [net, onStart]);

  const isHost = lobby.hostId === net.selfId;
  const link = `${location.origin}${location.pathname}#r=${net.roomCode}`;

  return (
    <div className="lobby">
      <div className="card">
        <h1>Lobby</h1>
        <div className="sub">
          Room <strong style={{ color: "var(--accent-2)", letterSpacing: 2 }}>{net.roomCode}</strong>
          {" · "}{lobby.players.length} / 4 players
        </div>

        <div className="players">
          {lobby.players.map((p) => (
            <div key={p.id} className="player">
              <span className="dot" style={{ background: CAR_COLORS[p.colorIndex] }} />
              <span className="name">{p.name || p.id.slice(0, 6)}</span>
              <span className="badge">
                {p.id === net.selfId && "you"}
                {p.id === net.selfId && p.id === lobby.hostId && " · "}
                {p.id === lobby.hostId && "host"}
              </span>
            </div>
          ))}
          {lobby.players.length < 4 && (
            <div className="player" style={{ opacity: 0.5 }}>
              <span className="dot" style={{ background: "#2a3144" }} />
              <span className="name">Waiting for players…</span>
            </div>
          )}
        </div>

        <div className="row">
          <input type="text" readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
          <button onClick={() => {
            navigator.clipboard?.writeText(link);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }}>{copied ? "Copied" : "Copy"}</button>
        </div>

        <div className="row" style={{ marginTop: 16 }}>
          <button onClick={onLeave}>Leave</button>
          <div className="spacer" />
          {isHost ? (
            <button className="primary" onClick={onStart} disabled={lobby.players.length < 1}>
              Start race
            </button>
          ) : (
            <span style={{ color: "var(--muted)", fontSize: 13 }}>Waiting for host to start…</span>
          )}
        </div>
      </div>
    </div>
  );
}
