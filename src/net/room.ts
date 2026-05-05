import { joinRoom, selfId, Room } from "trystero";
import {
  APP_ID, CAR_COLORS, ChatMsg, InputMsg, LobbyMsg, MAX_PLAYERS,
  PlayerInfo, SnapshotMsg, StartMsg
} from "./protocol";

export type NetEvents = {
  onLobby?: (lobby: LobbyMsg) => void;
  onStart?: (s: StartMsg, fromId: string) => void;
  onInput?: (msg: InputMsg, fromId: string) => void;
  onSnapshot?: (msg: SnapshotMsg) => void;
  onChat?: (msg: ChatMsg, fromId: string) => void;
  onPeerLeave?: (id: string) => void;
  onPeerJoin?: (id: string) => void;
};

export class NetRoom {
  readonly selfId: string = selfId;
  readonly roomCode: string;
  latestStart: StartMsg | null = null;
  private startListeners: Array<(msg: StartMsg, fromId: string) => void> = [];
  private room: Room;
  private events: NetEvents = {};
  private players: Map<string, PlayerInfo> = new Map();
  private joinedAt: number = Date.now();
  private name: string;
  private colorIndex: number = 0;

  // Trystero "actions". Each tuple is [send, subscribe].
  private sendHello: (data: PlayerInfo, ids?: string | string[]) => void;
  private sendLobby: (data: LobbyMsg, ids?: string | string[]) => void;
  private sendStart: (data: StartMsg, ids?: string | string[]) => void;
  private sendInput: (data: InputMsg, ids?: string | string[]) => void;
  private sendSnapshot: (data: SnapshotMsg, ids?: string | string[]) => void;
  private sendChat: (data: ChatMsg, ids?: string | string[]) => void;

  constructor(roomCode: string, name: string) {
    this.roomCode = roomCode;
    this.name = name;
    this.room = joinRoom({ appId: APP_ID }, roomCode);

    const [hello, onHello] = this.room.makeAction<PlayerInfo>("hello");
    const [lobby, onLobby] = this.room.makeAction<LobbyMsg>("lobby");
    const [start, onStart] = this.room.makeAction<StartMsg>("start");
    const [input, onInput] = this.room.makeAction<InputMsg>("input");
    const [snap, onSnap] = this.room.makeAction<SnapshotMsg>("snap");
    const [chat, onChat] = this.room.makeAction<ChatMsg>("chat");

    this.sendHello = hello;
    this.sendLobby = lobby;
    this.sendStart = start;
    this.sendInput = input;
    this.sendSnapshot = snap;
    this.sendChat = chat;

    // Self entry.
    this.players.set(this.selfId, {
      id: this.selfId,
      name: this.name,
      colorIndex: this.colorIndex,
      joinedAt: this.joinedAt
    });

    onHello((info, peerId) => {
      this.players.set(peerId, info);
      this.reassignColors();
      this.broadcastLobby();
      this.events.onLobby?.(this.snapshotLobby());
    });

    onLobby((msg) => {
      // Reconcile by taking the union, keeping our own self entry authoritative.
      for (const p of msg.players) {
        if (p.id === this.selfId) continue;
        this.players.set(p.id, p);
      }
      this.events.onLobby?.(this.snapshotLobby());
    });

    onStart((msg, peerId) => {
      this.latestStart = msg;
      this.events.onStart?.(msg, peerId);
      for (const fn of this.startListeners) fn(msg, peerId);
    });
    onInput((msg, peerId) => this.events.onInput?.(msg, peerId));
    onSnap((msg) => this.events.onSnapshot?.(msg));
    onChat((msg, peerId) => this.events.onChat?.(msg, peerId));

    this.room.onPeerJoin((peerId) => {
      // Greet with our info so they can build the lobby.
      this.sendHello(this.selfEntry(), peerId);
      this.events.onPeerJoin?.(peerId);
    });
    this.room.onPeerLeave((peerId) => {
      this.players.delete(peerId);
      this.reassignColors();
      this.events.onLobby?.(this.snapshotLobby());
      this.events.onPeerLeave?.(peerId);
    });
  }

  on(events: NetEvents) { this.events = { ...this.events, ...events }; }

  // Persistent start subscription that survives screen changes — Lobby uses
  // this to detect when the host has fired the start message so the client
  // can transition to the race screen.
  onStartPersistent(fn: (msg: StartMsg, fromId: string) => void): () => void {
    this.startListeners.push(fn);
    return () => {
      this.startListeners = this.startListeners.filter((f) => f !== fn);
    };
  }

  recordOwnStart(msg: StartMsg) { this.latestStart = msg; }

  setName(name: string) {
    this.name = name;
    const me = this.players.get(this.selfId);
    if (me) me.name = name;
    this.broadcastHello();
  }

  selfEntry(): PlayerInfo {
    return {
      id: this.selfId,
      name: this.name,
      colorIndex: this.colorIndex,
      joinedAt: this.joinedAt
    };
  }

  // Color is assigned by deterministic order of joinedAt so all peers agree.
  private reassignColors() {
    const ordered = [...this.players.values()].sort((a, b) =>
      a.joinedAt - b.joinedAt || a.id.localeCompare(b.id));
    ordered.forEach((p, i) => { p.colorIndex = i % CAR_COLORS.length; });
    const me = this.players.get(this.selfId);
    if (me) this.colorIndex = me.colorIndex;
  }

  snapshotLobby(): LobbyMsg {
    const players = [...this.players.values()].sort((a, b) =>
      a.joinedAt - b.joinedAt || a.id.localeCompare(b.id));
    return { players, hostId: players[0]?.id ?? this.selfId };
  }

  isHost(): boolean {
    return this.snapshotLobby().hostId === this.selfId;
  }

  isFull(): boolean {
    return this.players.size >= MAX_PLAYERS;
  }

  broadcastHello() { this.sendHello(this.selfEntry()); }
  broadcastLobby() { this.sendLobby(this.snapshotLobby()); }
  broadcastStart(msg: StartMsg) { this.sendStart(msg); }
  sendInputTo(hostId: string, msg: InputMsg) { this.sendInput(msg, hostId); }
  broadcastSnapshot(msg: SnapshotMsg) { this.sendSnapshot(msg); }
  sendChatMsg(msg: ChatMsg) { this.sendChat(msg); }

  // ---- Media streaming pass-through (used by voice chat) ----
  addStream(stream: MediaStream) {
    this.room.addStream(stream);
  }
  removeStream(stream: MediaStream) {
    this.room.removeStream(stream);
  }
  onPeerStream(fn: (stream: MediaStream, peerId: string) => void) {
    this.room.onPeerStream(fn);
  }

  leave() { this.room.leave(); }
}

export function generateRoomCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

export function getRoomFromHash(): string | null {
  const m = location.hash.match(/[#&]r=([A-Z0-9]{4,12})/i);
  return m ? m[1].toUpperCase() : null;
}

export function setRoomInHash(code: string) {
  location.hash = `#r=${code}`;
}
