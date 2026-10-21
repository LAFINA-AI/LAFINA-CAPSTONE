/** Contracts only. Phase 01 provides no alarm, speech or intent implementation. */
export type Capability = {available: false; reason: string} | {available: true};
export interface AlarmPort {
  capability(): Promise<Capability>;
  schedule(job: {
    id: string;
    occurrenceKey: string;
    generation: number;
    dueAtUtc: string;
  }): Promise<void>;
  cancel(jobId: string): Promise<void>;
}
export interface SpeechToTextPort {
  capability(): Promise<Capability>;
  start(sessionId: string): Promise<void>;
  stop(sessionId: string): Promise<string>;
  cancel(sessionId: string): Promise<void>;
}
export interface TextToSpeechPort {
  capability(): Promise<Capability>;
  speak(utteranceId: string, text: string): Promise<void>;
  stop(): Promise<void>;
}
export interface IntentParserPort {
  parse(
    text: string,
  ): Promise<{kind: 'unavailable' | 'clarification'; message: string}>;
}
