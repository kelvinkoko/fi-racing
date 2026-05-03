import { useEffect, useRef, useState } from "react";
import { buildTrack, gridPositions } from "../game/track";
import { renderTrackArt } from "../render/trackRender";
import { createCamera, drawScene, followCamera, CarVisual } from "../render/scene";
import { Car, emptyInput, stepCar } from "../game/car";
import { Keyboard } from "../input/keyboard";
import { SIM_DT } from "../game/constants";

export default function Race() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [speed, setSpeed] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d", { alpha: false })!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const track = buildTrack(60);
    const art = renderTrackArt(track, 1);
    const cam = createCamera();
    const grid = gridPositions(track, 1);

    const player: Car = {
      id: "local",
      name: "You",
      color: "#ff2e4d",
      pos: { ...grid[0].pos },
      vel: { x: 0, y: 0 },
      angle: grid[0].angle,
      speed: 0,
      input: emptyInput()
    };
    cam.x = player.pos.x;
    cam.y = player.pos.y;

    const kb = new Keyboard();
    kb.attach();

    const resize = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    let lastTime = performance.now();
    let acc = 0;
    let raf = 0;
    let speedTick = 0;

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      acc += dt;
      while (acc >= SIM_DT) {
        player.input = kb.read();
        stepCar(player, track);
        acc -= SIM_DT;
      }
      followCamera(cam, player.pos, canvas.clientWidth, canvas.clientHeight, dt);

      const cars: CarVisual[] = [{
        pos: player.pos,
        angle: player.angle,
        color: player.color,
        isLocal: true
      }];
      drawScene(ctx, cam, track, art, cars, canvas.clientWidth, canvas.clientHeight);

      speedTick += dt;
      if (speedTick > 0.1) {
        speedTick = 0;
        setSpeed(Math.round(player.speed));
      }

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      kb.detach();
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <div className="race">
      <canvas ref={canvasRef} />
      <div className="hud">
        <div className="lap">Lap 1 / 3</div>
        <div className="pos">Speed: {speed}</div>
      </div>
    </div>
  );
}
