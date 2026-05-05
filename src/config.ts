// Top-level feature flags. Flip these without touching call-sites.

// Voice chat over the existing WebRTC mesh. When false the mic button
// disappears from Lobby and Race, no getUserMedia is ever called, and
// the VoiceChat module is never instantiated.
export const VOICE_CHAT_ENABLED = true;
