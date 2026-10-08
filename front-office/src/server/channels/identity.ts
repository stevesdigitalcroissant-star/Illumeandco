import { sha256 } from "../auth";

/** Stable, non-reversible key for "this sender on this channel" (a phone number, a widget visitor token…). */
export const identityHash = (channel: string, identity: string) => sha256(`${channel}:${identity}`);
