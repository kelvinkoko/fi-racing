import { useEffect, useRef, useState } from "react";
import Race from "./ui/Race";
import Menu from "./ui/Menu";
import Lobby from "./ui/Lobby";
import { NetRoom, getRoomFromHash, setRoomInHash } from "./net/room";

type Screen = "menu" | "lobby" | "race";

export default function App() {
  const [screen, setScreen] = useState<Screen>("menu");
  const netRef = useRef<NetRoom | null>(null);
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
    const net = new NetRoom(room, name);
    netRef.current = net;
    setRoomInHash(room);
    setScreen("lobby");
    force((n) => n + 1);
  }

  function leaveRoom() {
    netRef.current?.leave();
    netRef.current = null;
    location.hash = "";
    setScreen("menu");
  }

  function startRace() {
    setScreen("race");
  }

  if (screen === "race" && netRef.current) {
    return <Race net={netRef.current} onExit={leaveRoom} />;
  }
  if (screen === "lobby" && netRef.current) {
    return <Lobby net={netRef.current} onStart={startRace} onLeave={leaveRoom} />;
  }

  // Pre-fill room code into Menu via Menu's join field if hash is present.
  const prefilledRoom = getRoomFromHash() ?? "";
  return <Menu key={prefilledRoom} onEnter={enterRoom} initialRoom={prefilledRoom} />;
}
