# Fi Racing

A serverless 2D top-down slot-car style racing game playable in the browser.
Two to four players join the same race by sharing a link or scanning a QR code.
There is no backend server — peers find each other through public BitTorrent
trackers and then exchange game traffic directly over WebRTC.

**▶ Play it now: <https://kelvinkoko.github.io/fi-racing/>**

Open the link, click **Create race** and share the URL (or QR code in the lobby)
with up to three friends. Or click **Time trial** for a solo hot-lap session.

## Features

- **F1-style cars** with sidepods, halo cockpit, exposed wheels and team-coloured wings
- **Hand-tuned circuit** with start straight, fast kink, S-chicane, hairpin and a sweeping double-apex, drawn from a Catmull-Rom spline with red/white curbs and runoff
- **Slot-car physics**: throttle controls speed; tap left/right to switch between three lanes; carry too much speed into a corner and the car deslots, slides off-line on free-body physics for a couple of seconds, then respawns slowly — a real penalty
- **Realistic F1 corner speeds** (tuned around 5g lateral): straights up to ~338 km/h, hairpins around 100 km/h
- **Same-lane blocking**: a faster car can't drive through a slower one — you must change lanes to overtake
- **F1-style live ranking panel** with lap (Lx/10) and gap to leader (`+0.872` or `+1 L`)
- **Mini-map** in the corner showing every player's position
- **Lookahead speed limit** in the HUD (`MAX 120` km/h) so you know when to brake before the corner arrives
- **2–4 player multiplayer** over WebRTC mesh; host runs the authoritative simulation, clients send inputs and interpolate snapshots
- **Touch controls** auto-shown on mobile (gas / brake / lane-shift pads); keyboard hint pill on desktop
- **Synchronised countdown** and host-left handling
- **PWA-friendly static deploy**: ~110 KB gzipped, no backend

## Running locally

```sh
npm install
npm run dev
```

Open the printed URL on two browsers (or one browser + one phone) to test
multiplayer locally.

```sh
npm run build      # production build → dist/
npm run preview    # serve the production build
npm run typecheck  # tsc --noEmit
```

## Controls

**Desktop**

| Action | Key |
|---|---|
| Throttle | `W`, `↑`, `Space` |
| Brake | `S`, `↓` |
| Lane left | `A`, `←` |
| Lane right | `D`, `→` |

**Mobile**

- Big green pad bottom-right: hold for throttle
- Red pad: brake
- Two cyan pads bottom-left: step lane left / right

## Project layout

```
src/
  main.tsx           # entry, mounts <App>
  App.tsx            # routes between Menu / Lobby / Race screens
  game/
    spline.ts        # Vec2 + Catmull-Rom spline
    track.ts         # track geometry, lanes, curvature, lap progress helpers
    car.ts           # slot-car simulation (throttle, drag, deslot, lane lerp)
    race.ts          # lap detection
    constants.ts     # SIM_HZ
  render/
    trackRender.ts   # cached track art (grass, asphalt, curbs, lane stripes)
    scene.ts         # camera + per-frame draw of track + cars
    miniMap.ts       # cached track outline + per-frame dots
  net/
    protocol.ts      # wire types: hello / lobby / start / input / snapshot
    room.ts          # Trystero wrapper, host election, persistent start subscription
    raceLoop.ts      # host sim, traffic resolution, snapshot encoding, client view interpolation
  input/
    keyboard.ts      # WASD / arrow / space; edge-triggered lane shift
    touch.ts         # on-screen pad pointer handlers
  ui/
    Menu.tsx         # name + create / join
    Lobby.tsx        # room code, players, QR + link, host start
    Race.tsx         # main race screen — sim loop, HUD, ranking, minimap
```

## How the multiplayer works

1. **Discovery**: both peers call `joinRoom({appId, roomCode})` from
   [Trystero](https://github.com/dmotz/trystero). Trystero hashes
   `appId + roomCode` into a BitTorrent info-hash and announces under it on
   public WebSocket trackers (e.g. `tracker.openwebtorrent.com`). The trackers
   relay a single WebRTC offer/answer + ICE candidates between each pair of
   peers.
2. **Mesh**: once SDP is exchanged the trackers are out of the loop. All
   gameplay traffic flows directly peer-to-peer over an encrypted WebRTC
   `RTCDataChannel`.
3. **Host election**: every peer runs the same deterministic sort over
   `joinedAt + id` and picks the smallest as host — no coordination needed.
4. **Authoritative sim**: the host runs the slot simulation at 60 Hz fixed
   timestep for every car (including its own), broadcasts quantised snapshots
   at 20 Hz, and applies remote inputs received at 30 Hz from clients.
   Clients interpolate snapshots with a critically-damped follow.
5. **Host disconnect** ends the race for everyone (no host migration in v1).

### Privacy notes

- Public BitTorrent trackers see your IP and the hash of your room code, but
  not gameplay data.
- WebRTC peers see each other's public IP addresses (this is fundamental to
  P2P; only relaying through TURN would hide it).
- Anyone with the room code/link can join — no authentication.

## Tuning

Most game-feel knobs live in `src/game/car.ts`:

```ts
export const SLOT = {
  accel: 220,
  brake: 720,
  drag: 0.40,
  topSpeed: 470,        // ≈ 338 km/h
  maxCentripetal: 750,  // smaller = grippier; bigger = falls off more easily
  warnRatio: 0.7,       // CORNER! warning at this fraction of the limit
  laneSwitchRate: 1.4,  // lanes / second
  deslotDuration: 2.4,  // recovery seconds after a deslot
  respawnSpeed: 50,
};
```

Track shape: `CONTROL_POINTS` in `src/game/track.ts`.
Lane count: `LANE_OFFSETS` in `src/game/track.ts`.
Race length: `TOTAL_LAPS` in `src/ui/Race.tsx`.

## Deploy

GitHub Pages workflow at `.github/workflows/deploy.yml` builds on every push
to `main` and publishes `dist/`. Repo Settings → Pages → Source must be set
to **GitHub Actions**.

## Stack

- [Vite](https://vitejs.dev) + [React](https://react.dev) + TypeScript
- [Trystero](https://github.com/dmotz/trystero) for serverless WebRTC signalling
- [qrcode](https://github.com/soldair/node-qrcode) for the lobby QR
- Plain Canvas 2D for rendering — no game engine
