import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { NetRoom } from "../net/room";
import { VoiceChat } from "../net/voice";
import { CAR_COLORS, LobbyMsg } from "../net/protocol";
import MicButton from "./MicButton";

type Props = {
  net: NetRoom;
  voice: VoiceChat | null;
  onStart: (totalLaps: number) => void;
  onLeave: () => void;
};

const LAP_OPTIONS = [3, 5, 10, 20];
const LAP_KEY = "fi-racing.totalLaps";

function loadInitialLaps(): number {
  const v = localStorage.getItem(LAP_KEY);
  const n = v ? Number(v) : 5;
  return LAP_OPTIONS.includes(n) ? n : 5;
}

export default function Lobby({ net, voice, onStart, onLeave }: Props) {
  const [lobby, setLobby] = useState<LobbyMsg>(() => net.snapshotLobby());
  const [copied, setCopied] = useState(false);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [selectedLaps, setSelectedLaps] = useState<number>(loadInitialLaps);

  useEffect(() => {
    net.on({ onLobby: setLobby });
    net.broadcastHello();
    // Clients receive the host's start broadcast here. The msg carries the
    // chosen totalLaps so the client transitions to the race using the
    // same value the host picked.
    const off = net.onStartPersistent((msg) => onStart(msg.totalLaps));
    return off;
  }, [net, onStart]);

  const isHost = lobby.hostId === net.selfId;
  const link = `${location.origin}${location.pathname}#r=${net.roomCode}`;

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(link, {
      margin: 1,
      width: 220,
      color: { dark: "#0b0d12", light: "#ffffff" },
      errorCorrectionLevel: "M"
    }).then((url) => {
      if (!cancelled) setQrUrl(url);
    }).catch((e) => console.error("QR generation failed", e));
    return () => { cancelled = true; };
  }, [link]);

  const handleStart = () => {
    localStorage.setItem(LAP_KEY, String(selectedLaps));
    onStart(selectedLaps);
  };

  return (
    <div className="lobby">
      <div className="card">
        <h1>Lobby</h1>
        <div className="sub">
          Room <strong style={{ color: "var(--accent-2)", letterSpacing: 2 }}>{net.roomCode}</strong>
          {" · "}{lobby.players.length} / 4 players
        </div>

        {qrUrl && (
          <div className="qr-wrap">
            <img src={qrUrl} alt="Scan to join" className="qr" />
            <div className="qr-caption">Scan to join</div>
          </div>
        )}

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

        {isHost && (
          <div className="row lap-selector">
            <span className="lap-selector-label">Laps</span>
            {LAP_OPTIONS.map((n) => (
              <button
                key={n}
                className={"lap-pill" + (n === selectedLaps ? " active" : "")}
                onClick={() => setSelectedLaps(n)}
              >{n}</button>
            ))}
            <div className="spacer" />
          </div>
        )}

        <div className="row" style={{ marginTop: 16 }}>
          <button onClick={onLeave}>Leave</button>
          <MicButton voice={voice} />
          <div className="spacer" />
          {isHost ? (
            <button className="primary" onClick={handleStart} disabled={lobby.players.length < 1}>
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
