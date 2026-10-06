/**
 * Streaming a reply to the customer without weakening the claim guard.
 *
 * Model text is released one complete sentence at a time, and only after the
 * claim guard passes on everything released so far. A sentence that claims an
 * action no tool has performed (yet) is held, together with everything after
 * it. The agent always finishes with a `final` event carrying the
 * authoritative, fully guarded reply, so held text is either confirmed later
 * in the turn or replaced — it is never shown unverified.
 */
import { findUnsupportedClaim } from "./safety";
import type { TurnEvent } from "./tools/registry";

export type ReplyStreamEvent =
  | { type: "status"; label: string }
  | { type: "delta"; text: string }
  | { type: "reset" }
  | { type: "final"; text: string };

export type ReplyStreamSink = (event: ReplyStreamEvent) => void;

// A sentence ends at . ! ? … (optionally followed by closing quotes/brackets) plus whitespace, or at a newline.
const SENTENCE_END = /[.!?…]+["')\]]*\s+|\n+/g;

export class GuardedReplyStream {
  private released = "";
  private pending = "";
  private holding = false;

  constructor(
    private readonly emit: ReplyStreamSink,
    /** Live list of this turn's tool results (mutated as tools run). */
    private readonly events: TurnEvent[],
  ) {}

  push(delta: string) {
    if (!delta) return;
    this.pending += delta;
    if (this.holding) return;
    let cut = 0;
    SENTENCE_END.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = SENTENCE_END.exec(this.pending))) {
      const end = m.index + m[0].length;
      const sentence = this.pending.slice(cut, end);
      if (findUnsupportedClaim(this.released + sentence, this.events)) {
        this.holding = true;
        break;
      }
      this.released += sentence;
      this.emit({ type: "delta", text: sentence });
      cut = end;
    }
    this.pending = this.pending.slice(cut);
  }

  /** Discard everything shown in the current step (interim text before tool calls, or a declined partial). */
  reset() {
    if (this.released) this.emit({ type: "reset" });
    this.released = "";
    this.pending = "";
    this.holding = false;
  }
}

/** Generic, customer-safe progress labels. Never include tool inputs or outputs. */
export const TOOL_STATUS: Record<string, string> = {
  get_available_appointments: "Checking availability…",
  book_appointment: "Booking your appointment…",
  reschedule_appointment: "Updating your appointment…",
  cancel_appointment: "Cancelling your appointment…",
  get_customer_appointments: "Looking up your appointments…",
  search_knowledge_base: "Looking that up…",
  get_services: "Checking our services…",
  get_service_details: "Checking our services…",
  get_business_information: "Checking our details…",
  escalate_to_human: "Connecting you with the team…",
};
