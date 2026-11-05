export type MeetingErrorCode =
  | 'microphone_permission_denied'
  | 'microphone_not_found'
  | 'microphone_in_use'
  | 'recording_failed'
  | 'insufficient_storage'
  | 'recording_lost'
  | 'unsupported_media_format'
  | 'media_file_unreadable'
  | 'media_has_no_audio'
  | 'media_too_long'
  | 'audio_conversion_failed'
  | 'import_interrupted'
  | 'whisper_not_installed'
  | 'whisper_model_missing'
  | 'whisper_init_failed'
  | 'transcription_failed'
  | 'transcription_interrupted'
  | 'empty_transcript'
  | 'offline'
  | 'unauthorized'
  | 'plan_required'
  | 'rate_limited'
  | 'notes_service_failed'
  | 'notes_interrupted'
  | 'cancelled'
  | 'unknown';

export type RecoveryAction =
  | 'retry_transcription'
  | 'retry_notes'
  | 'choose_another_file'
  | 'open_privacy_settings'
  | 'sign_in'
  | 'view_transcript'
  | 'none';

export interface MeetingErrorInfo {
  code: MeetingErrorCode;
  title: string;
  message: string;
  recovery: RecoveryAction;
  recoveryLabel: string;
}

const CATALOG: Record<MeetingErrorCode, Omit<MeetingErrorInfo, 'code'>> = {
  microphone_permission_denied: {
    title: 'Microphone access is turned off',
    message:
      'Allow microphone access for LAFINA in your system privacy settings, then try recording again.',
    recovery: 'open_privacy_settings',
    recoveryLabel: 'Open Privacy Settings',
  },
  microphone_not_found: {
    title: 'No microphone was found',
    message: 'Connect a microphone or headset and select it before starting the recording.',
    recovery: 'none',
    recoveryLabel: '',
  },
  microphone_in_use: {
    title: 'Microphone is busy',
    message:
      'Another application or LAFINA voice feature is currently using the microphone. Close it and try again.',
    recovery: 'none',
    recoveryLabel: '',
  },
  recording_failed: {
    title: 'Recording stopped unexpectedly',
    message:
      'The audio device stopped delivering sound. Any audio captured before the interruption was saved.',
    recovery: 'retry_transcription',
    recoveryLabel: 'Transcribe Saved Audio',
  },
  insufficient_storage: {
    title: 'Low disk space',
    message:
      'Recording stopped because free disk space dropped below the safety limit. Captured audio was saved.',
    recovery: 'retry_transcription',
    recoveryLabel: 'Transcribe Saved Audio',
  },
  recording_lost: {
    title: 'Recording file not found',
    message:
      'The saved audio file for this meeting is no longer on disk and cannot be transcribed again.',
    recovery: 'none',
    recoveryLabel: '',
  },
  unsupported_media_format: {
    title: 'File format not supported',
    message: 'Choose an audio or video recording in MP3, WAV, M4A, AAC, OGG, FLAC, MP4, MOV, MKV or WebM format.',
    recovery: 'choose_another_file',
    recoveryLabel: 'Choose another file',
  },
  media_file_unreadable: {
    title: 'Could not read that file',
    message: 'The file could not be opened or appears to be damaged. Make sure it is stored on this device and try again.',
    recovery: 'choose_another_file',
    recoveryLabel: 'Choose another file',
  },
  media_has_no_audio: {
    title: 'No audio track found',
    message: 'That video file does not contain an audio track to transcribe.',
    recovery: 'choose_another_file',
    recoveryLabel: 'Choose another file',
  },
  media_too_long: {
    title: 'Recording is too long',
    message: 'Imported recordings can be up to 4 hours long. Trim or split the file and import each part.',
    recovery: 'choose_another_file',
    recoveryLabel: 'Choose another file',
  },
  audio_conversion_failed: {
    title: 'Could not prepare audio',
    message: 'LAFINA could not decode the audio track in that file. Try exporting it as WAV, MP3 or M4A first.',
    recovery: 'choose_another_file',
    recoveryLabel: 'Choose another file',
  },
  import_interrupted: {
    title: 'Import was interrupted',
    message: 'LAFINA closed while preparing the uploaded file. Import the file again to transcribe it.',
    recovery: 'choose_another_file',
    recoveryLabel: 'Import file again',
  },
  whisper_not_installed: {
    title: 'Speech engine is not installed',
    message: 'Local transcription requires the Whisper speech engine.',
    recovery: 'retry_transcription',
    recoveryLabel: 'Try Again',
  },
  whisper_model_missing: {
    title: 'Speech model could not be downloaded',
    message: 'Connect to the internet once so LAFINA can download the local Whisper speech model, then try again.',
    recovery: 'retry_transcription',
    recoveryLabel: 'Download & Transcribe',
  },
  whisper_init_failed: {
    title: 'Speech engine failed to start',
    message: 'Whisper could not load the speech model. Try again.',
    recovery: 'retry_transcription',
    recoveryLabel: 'Retry Transcription',
  },
  transcription_failed: {
    title: 'Transcription did not finish',
    message: 'An error occurred while transcribing the audio. Your recording is safe and can be retried.',
    recovery: 'retry_transcription',
    recoveryLabel: 'Retry Transcription',
  },
  transcription_interrupted: {
    title: 'Transcription was interrupted',
    message: 'The app closed before transcription finished. Your recording was kept on disk and can be transcribed now.',
    recovery: 'retry_transcription',
    recoveryLabel: 'Resume Transcription',
  },
  empty_transcript: {
    title: 'No speech was detected',
    message: 'The recording contained silence or background noise only. Check that the microphone was not muted.',
    recovery: 'retry_transcription',
    recoveryLabel: 'Transcribe Again',
  },
  offline: {
    title: 'No internet connection',
    message: 'Your transcript is saved on this device. Connect to the internet to generate AI meeting notes.',
    recovery: 'retry_notes',
    recoveryLabel: 'Generate Notes',
  },
  unauthorized: {
    title: 'Sign in required for AI notes',
    message: 'Your transcript is saved locally. Sign in to your cloud account to generate structured meeting notes.',
    recovery: 'sign_in',
    recoveryLabel: 'Sign In',
  },
  plan_required: {
    title: 'AI notes require Online Mode / Cloud Account',
    message: 'Your full transcript is saved and searchable below. Connect to Online Mode to generate structured summaries and action items.',
    recovery: 'view_transcript',
    recoveryLabel: 'View Transcript',
  },
  rate_limited: {
    title: 'Too many requests right now',
    message: 'Wait a minute and generate the notes again. Your transcript is safely saved.',
    recovery: 'retry_notes',
    recoveryLabel: 'Try Again',
  },
  notes_service_failed: {
    title: 'Could not write meeting notes',
    message: 'The AI notes service did not finish. Your transcript is saved, and you can retry generating notes at any time.',
    recovery: 'retry_notes',
    recoveryLabel: 'Retry Notes',
  },
  notes_interrupted: {
    title: 'Note generation was interrupted',
    message: 'The app closed while writing notes. Your transcript is saved and any completed sections will be reused.',
    recovery: 'retry_notes',
    recoveryLabel: 'Resume Notes',
  },
  cancelled: {
    title: 'Cancelled',
    message: 'Processing was cancelled. Any completed work has been kept.',
    recovery: 'none',
    recoveryLabel: '',
  },
  unknown: {
    title: 'Something went wrong',
    message: 'An unexpected error occurred. Your recording and transcript are preserved so you can try again.',
    recovery: 'retry_transcription',
    recoveryLabel: 'Try Again',
  },
};

export const describeMeetingError = (
  code: MeetingErrorCode,
  detail?: string,
): MeetingErrorInfo => {
  const entry = CATALOG[code] ?? CATALOG.unknown;
  return {
    code,
    ...entry,
    message:
      detail && code === 'unknown' ? `${entry.message} (${detail})` : entry.message,
  };
};

export const classifyNotesFailure = (
  status: string,
  errorText?: string,
): MeetingErrorCode => {
  switch (status) {
    case 'offline':
      return 'offline';
    case 'auth_required':
    case 'unauthorized':
      return 'unauthorized';
    case 'subscription_required':
    case 'forbidden':
      return 'plan_required';
    case 'rate_limited':
      return 'rate_limited';
    default:
      if (errorText && /abort|cancel/i.test(errorText)) return 'cancelled';
      return 'notes_service_failed';
  }
};

export const isRetryable = (code: MeetingErrorCode): boolean =>
  code === 'offline' || code === 'rate_limited' || code === 'notes_service_failed';

export class MeetingError extends Error {
  readonly code: MeetingErrorCode;
  readonly detail?: string;

  constructor(code: MeetingErrorCode, detail?: string) {
    const info = describeMeetingError(code, detail);
    super(info.message);
    this.name = 'MeetingError';
    this.code = code;
    this.detail = detail;
  }
}
