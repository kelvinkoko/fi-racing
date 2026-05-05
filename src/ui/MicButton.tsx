import { useEffect, useState } from "react";
import { VoiceChat, VoiceState } from "../net/voice";

type Props = {
  voice: VoiceChat | null;
  className?: string;
};

// Three-state mic button.
//   off   → click → asks for mic permission, becomes "live"
//   live  → click → becomes "muted"
//   muted → click → becomes "live"
// Once joined, the only way to fully leave voice is to leave the room.
export default function MicButton({ voice, className = "" }: Props) {
  const [state, setState] = useState<VoiceState>(() => voice?.getState() ?? "off");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!voice) return;
    setState(voice.getState());
    return voice.subscribe(setState);
  }, [voice]);

  if (!voice) return null;

  const handleClick = async () => {
    if (pending) return;
    setPending(true);
    try {
      await voice.toggle();
    } finally {
      setPending(false);
    }
  };

  const label =
    state === "off"   ? "Voice"
  : state === "live"  ? "Live"
                       : "Muted";
  const icon =
    state === "off"   ? "🎙"
  : state === "live"  ? "🎙"
                       : "🔇";

  return (
    <button
      className={`mic-btn mic-${state} ${className}`}
      onClick={handleClick}
      title={state === "off" ? "Join voice chat" : state === "live" ? "Mute mic" : "Unmute mic"}
      disabled={pending}
    >
      <span className="mic-icon" aria-hidden="true">{icon}</span>
      <span className="mic-label">{label}</span>
    </button>
  );
}
