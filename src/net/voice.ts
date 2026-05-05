import { NetRoom } from "./room";

export type VoiceState = "off" | "live" | "muted";

// Voice-chat layer that piggybacks on the existing Trystero mesh. Each
// peer publishes one local audio track to the room; remote tracks are
// attached to hidden <audio> elements so the browser handles the
// playback. iOS requires playsInline + autoplay + a user gesture before
// any of this works, so start() must be called from a tap/click.
export class VoiceChat {
  private net: NetRoom;
  private localStream: MediaStream | null = null;
  private peerAudios = new Map<string, HTMLAudioElement>();
  private state: VoiceState = "off";
  private listeners = new Set<(s: VoiceState) => void>();
  private peerStreamHandlerInstalled = false;

  constructor(net: NetRoom) {
    this.net = net;
    // Tear down a peer's <audio> when they disconnect so we don't leak
    // dead elements.
    this.net.on({
      onPeerLeave: (peerId) => {
        this.detachPeerAudio(peerId);
      }
    });
  }

  getState(): VoiceState { return this.state; }

  subscribe(fn: (s: VoiceState) => void): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  private setState(s: VoiceState) {
    if (this.state === s) return;
    this.state = s;
    for (const fn of this.listeners) fn(s);
  }

  // Cycle: off → live → muted → live → muted ...
  // First "off → live" call asks for mic permission. Returns true if the
  // resulting state is "live" or "muted" (i.e. voice chat is running).
  async toggle(): Promise<boolean> {
    if (this.state === "off") {
      try {
        await this.start();
        this.setState("live");
        return true;
      } catch (e) {
        console.error("Voice start failed", e);
        return false;
      }
    }
    if (this.state === "live") {
      this.setMuted(true);
      this.setState("muted");
      return true;
    }
    // muted → live
    this.setMuted(false);
    this.setState("live");
    return true;
  }

  // Stop everything (used on leaving the room).
  dispose(): void {
    if (this.localStream) {
      try { this.net.removeStream(this.localStream); } catch { /* ignore */ }
      this.localStream.getTracks().forEach((t) => t.stop());
      this.localStream = null;
    }
    for (const [, audio] of this.peerAudios) {
      audio.pause();
      audio.srcObject = null;
      audio.remove();
    }
    this.peerAudios.clear();
    this.setState("off");
  }

  private async start(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("getUserMedia not supported");
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        autoGainControl: true,
        noiseSuppression: true
      },
      video: false
    });
    this.localStream = stream;
    this.setMuted(false);
    this.net.addStream(stream);

    if (!this.peerStreamHandlerInstalled) {
      this.net.onPeerStream((s, peerId) => this.attachPeerAudio(peerId, s));
      this.peerStreamHandlerInstalled = true;
    }
  }

  private setMuted(muted: boolean) {
    if (!this.localStream) return;
    this.localStream.getAudioTracks().forEach((t) => { t.enabled = !muted; });
  }

  private attachPeerAudio(peerId: string, stream: MediaStream) {
    let audio = this.peerAudios.get(peerId);
    if (!audio) {
      audio = document.createElement("audio");
      audio.autoplay = true;
      // iOS Safari needs the camelCase attribute on the JS element.
      (audio as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
      audio.setAttribute("playsinline", "");
      audio.style.display = "none";
      document.body.appendChild(audio);
      this.peerAudios.set(peerId, audio);
    }
    audio.srcObject = stream;
    audio.play().catch((e) => console.warn("voice playback failed", e));
  }

  private detachPeerAudio(peerId: string) {
    const audio = this.peerAudios.get(peerId);
    if (!audio) return;
    audio.pause();
    audio.srcObject = null;
    audio.remove();
    this.peerAudios.delete(peerId);
  }
}
