/**
 * Voice receptionist architecture (not active until a provider is connected).
 *
 *   Caller ──PSTN──▶ Telephony provider (e.g. Twilio Voice / SIP)
 *                       │  media stream (audio)
 *                       ▼
 *              Speech-to-text (streaming)
 *                       │  final transcript per caller turn
 *                       ▼
 *   handleInbound({ channel: "voice", identity: callerNumber, text })   ← same orchestrator as chat
 *                       │  agent reply text (same tools, permissions, audit)
 *                       ▼
 *              Text-to-speech ──▶ caller
 *
 * Transfer to human: when the agent calls `escalate_to_human` on a voice
 * conversation, the provider adapter performs a warm transfer to the
 * business's configured staff number instead of only flagging the inbox.
 *
 * The contract a provider implementation must satisfy:
 */
export interface VoiceProvider {
  /** Answer an incoming call and start streaming audio/transcripts. */
  answer(callId: string): Promise<void>;
  /** Speak text to the caller. */
  say(callId: string, text: string): Promise<void>;
  /** Transfer the live call to a human. */
  transfer(callId: string, toNumber: string): Promise<void>;
  hangup(callId: string): Promise<void>;
}

/** Voice-specific formatting: no markdown, no lists, spell out times. */
export const VOICE_STYLE_HINT =
  "You are speaking on a phone call. Use short spoken sentences, no lists or formatting, and say times naturally (e.g. 'two thirty in the afternoon').";
