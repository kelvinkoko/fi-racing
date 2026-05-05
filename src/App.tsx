import { useEffect, useRef, useState } from "react";
import Race from "./ui/Race";
import Menu from "./ui/Menu";
import Lobby from "./ui/Lobby";
import { NetRoom, getRoomFromHash, setRoomInHash } from "./net/room";
import { VoiceChat } from "./net/voice";
import { VOICE_CHAT_ENABLED } from "./config";

type Screen = "menu" | "lobby" | "race" | "timetrial";

export default function App() {
  const [screen, setScreen] = useState<Screen>("menu");
  const [chosenLaps, setChosenLaps] = useState<number>(5);
  const netRef = useRef<NetRoom | null>(null);
  const voiceRef = useRef<VoiceChat | null>(null);
  const [, force] = useState(0);

  // Auto-enter lobby if URL contains a room code.
  useEffect(() => {
    const room = getRoomFromHash();
    if (room && screen === "menu" && !netRef.current) {
      // Defer until name available — Menu will prompt and call onEnter.
    }
  }, [screen]);

  function enterRoom(room: string, name: string) {
    netRef.current?.leave();
    voiceRef.current?.dispose();
    const net = new NetRoom(room, name);
    netRef.current = net;
    voiceRef.current = VOICE_CHAT_ENABLED ? new VoiceChat(net) : null;
    setRoomInHash(room);
    setScreen("lobby");
    force((n) => n + 1);
  }

  function enterTimeTrial() {
    netRef.current?.leave();
    netRef.current = null;
    voiceRef.current?.dispose();
    voiceRef.current = null;
    location.hash = "";
    setScreen("timetrial");
  }

  function leaveRoom() {
    voiceRef.current?.dispose();
    voiceRef.current = null;
    netRef.current?.leave();
    netRef.current = null;
    location.hash = "";
    setScreen("menu");
  }

  function startRace(laps: number) {
    setChosenLaps(laps);
    setScreen("race");
  }

  if (screen === "race" && netRef.current) {
    return (
      <Race
        net={netRef.current}
        voice={voiceRef.current}
        onExit={leaveRoom}
        totalLaps={chosenLaps}
      />
    );
  }
  if (screen === "timetrial") {
    return <Race onExit={leaveRoom} timeTrial />;
  }
  if (screen === "lobby" && netRef.current) {
    return (
      <Lobby
        net={netRef.current}
        voice={voiceRef.current}
        onStart={startRace}
        onLeave={leaveRoom}
      />
    );
  }

  const prefilledRoom = getRoomFromHash() ?? "";
  return <Menu key={prefilledRoom} onEnter={enterRoom} onTimeTrial={enterTimeTrial} initialRoom={prefilledRoom} />;
}
