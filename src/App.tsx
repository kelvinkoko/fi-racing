import { useEffect, useState } from "react";
import Race from "./ui/Race";

type Screen = "menu" | "race";

function getScreenFromHash(): Screen {
  // For now, anything triggers race. Lobby/menu wired in next milestone.
  if (location.hash.startsWith("#race")) return "race";
  return "menu";
}

export default function App() {
  const [screen, setScreen] = useState<Screen>(getScreenFromHash());

  useEffect(() => {
    const onHash = () => setScreen(getScreenFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  if (screen === "race") return <Race />;

  return (
    <div className="app">
      <div className="menu">
        <div className="card">
          <h1>Fi Racing</h1>
          <div className="sub">Top-down arcade racer · 2–4 players · serverless</div>
          <div className="row">
            <button className="primary" onClick={() => { location.hash = "#race"; }}>
              Test drive the track
            </button>
          </div>
          <div className="row" style={{ marginTop: 16, color: "var(--muted)", fontSize: 13 }}>
            Multiplayer lobby coming next. Use Arrow keys / WASD to drive.
          </div>
        </div>
      </div>
    </div>
  );
}
