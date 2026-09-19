import type { LogMessage, LogSender, LogTone } from "@/types/game";
import { makeId } from "./dice";

export function makeLog(sender: LogSender, text: string, tone?: LogTone): LogMessage {
  return { id: makeId("log"), sender, text, tone, timestamp: Date.now() };
}
