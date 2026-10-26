/** Minimal domain ports for engine-independent work. Phase 05's richer system TTS
 * lifecycle/voice adapter is in core/native/textToSpeech (ADR-018). Phase06
 * speech sessions use core/native/speechToText. Phase07's strict contextual
 * intent boundary and confirmed executor live in core/ai.
 * Native alarms use the validated
 * durable-row reconciliation boundary in core/native/reminders (ADR-015).
 */
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
