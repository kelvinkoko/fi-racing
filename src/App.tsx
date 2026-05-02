import { RaceCanvas } from "./ui/RaceCanvas";

export function App(): JSX.Element {
  return (
    <div className="app">
      <header className="topbar">
        <h1>
          F<span className="accent">i</span> Racing
        </h1>
        <span className="tag">Formula i — AI-driven racing demo</span>
        <div className="spacer" />
        <a
          href="https://github.com/kelvinkoko/fi-racing"
          target="_blank"
          rel="noreferrer"
          style={{ color: "var(--muted)", fontSize: 13, textDecoration: "none" }}
        >
          GitHub →
        </a>
      </header>
      <div className="stage">
        <RaceCanvas />
      </div>
    </div>
  );
}
