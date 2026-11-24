export type PrivacySectionIconKey =
  | 'database'
  | 'mic'
  | 'cloud'
  | 'sparkles'
  | 'users'
  | 'smartphone'
  | 'lock'
  | 'trash'
  | 'alert'
  | 'graduation'
  | 'mail';

export interface PrivacyBullet {
  label: string;
  text: string;
}

export interface PrivacyCallout {
  tone: 'warning' | 'info';
  title: string;
  text: string;
}

export interface PrivacySection {
  id: string;
  title: string;
  icon: PrivacySectionIconKey;
  summary: string;
  bullets?: readonly PrivacyBullet[];
  callout?: PrivacyCallout;
}

export interface PrivacyHighlight {
  id: string;
  icon: 'wifiOff' | 'eyeOff' | 'micOff' | 'sliders';
  title: string;
  subtitle: string;
}

export const PRIVACY_POLICY_EFFECTIVE_DATE = 'November 24, 2026';

export const PRIVACY_HIGHLIGHTS: readonly PrivacyHighlight[] = [
  {
    id: 'offline-first',
    icon: 'wifiOff',
    title: 'Offline-First',
    subtitle: 'Stored locally in SQLite on your phone',
  },
  {
    id: 'no-ads',
    icon: 'eyeOff',
    title: 'No Data Selling',
    subtitle: 'No ads, trackers, or data brokers',
  },
  {
    id: 'tap-mic',
    icon: 'micOff',
    title: 'Tap-Only Mic',
    subtitle: 'No wake word or passive listening',
  },
  {
    id: 'your-control',
    icon: 'sliders',
    title: 'You Are in Control',
    subtitle: 'Clear local & synced data anytime',
  },
];

export const PRIVACY_SECTIONS: readonly PrivacySection[] = [
  {
    id: 'data-collection',
    title: '1. Data Collection',
    icon: 'database',
    summary:
      'LAFINA is designed around local-first storage so your academic records stay on your device unless you actively choose an online feature.',
    bullets: [
      {
        label: 'Local Academic Records:',
        text: 'Your schedules, tasks, events, time blocks, reminders, alarms, notes, custom categories, study materials, and app preferences are stored locally in an on-device SQLite database (lafina.db) and private app storage.',
      },
      {
        label: 'Guest vs. Cloud Account:',
        text: 'You can use LAFINA offline in Guest Mode without creating an account. If you register or sign in, we collect your display name, email address, securely hashed authentication credentials, account plan status, and optional academic profile details you enter.',
      },
      {
        label: 'Uploaded & Imported Files:',
        text: 'If you import a Certificate of Registration (COR), calendar file (.ics), PDF, image, or study document, LAFINA extracts the relevant text or schedule for you to review. Nothing is added to your calendar until you confirm it.',
      },
    ],
  },
  {
    id: 'voice-audio',
    title: '2. Voice, Microphone & Audio Processing',
    icon: 'mic',
    summary:
      'Your microphone is strictly user-triggered. LAFINA never listens passively and has no always-on wake word.',
    bullets: [
      {
        label: 'On-Device by Default:',
        text: 'Push-to-talk voice commands, voice activity detection, offline speech-to-text, and default text-to-speech run directly on your device.',
      },
      {
        label: 'Optional Online Voice & Transcription:',
        text: 'When Online Mode is enabled and you use online voice playback, enhanced cloud transcription, or explicitly consent to cloud meeting summarization, only the relevant text, transcript, or audio chunk is sent over HTTPS through our backend to third-party speech or AI processors to return the result.',
      },
      {
        label: 'Simulated Reminder Calls:',
        text: 'Reminder calls are local notifications styled like an incoming call. They are not real phone or VoIP calls and never access your cellular call logs, SIM, or contacts.',
      },
    ],
    callout: {
      tone: 'warning',
      title: 'Recording Consent Responsibility',
      text: 'If you record lectures or meetings, you are solely responsible for informing participants and obtaining all required consent under applicable laws (including the Philippine Anti-Wiretapping Act, Republic Act No. 4200) and USTP policies.',
    },
  },
  {
    id: 'cloud-sync',
    title: '3. Cloud Sync, Chat History & Personal Memory',
    icon: 'cloud',
    summary:
      'Signed-in accounts can synchronize personal planner records and recent chats across sessions over encrypted HTTPS.',
    bullets: [
      {
        label: 'Planner Synchronization:',
        text: 'When signed in, your profile, tasks, events, time blocks, reminders, notes, and custom categories sync bidirectionally with the LAFINA cloud backend so your schedule stays backed up.',
      },
      {
        label: 'Chat History Sync:',
        text: 'Enabled by default for signed-in accounts (toggleable anytime in Profile → Chat & Memory) and limited to up to 20 chat sessions per account. Attachments sync as text descriptions only; original attachment files stay on your device. Turning sync off keeps your existing cloud copy; clearing chats permanently deletes synced chat copies from the cloud.',
      },
      {
        label: 'Personal Memory:',
        text: 'Optional Personal Memory stores study preferences and context you share to tailor replies. You can view, edit, or delete stored memory entries at any time.',
      },
    ],
  },
  {
    id: 'online-ai',
    title: '4. Online AI & Academic Tools',
    icon: 'sparkles',
    summary:
      'Online Mode enables cloud-assisted chat, Ask USTP handbook answers, Lesson Q&A, document generation, and meeting summaries.',
    bullets: [
      {
        label: 'What Is Sent:',
        text: 'When you initiate an online AI request, your prompt, relevant conversation context, extracted document text, and applicable schedule or memory context are transmitted over HTTPS through the LAFINA backend to third-party AI model providers solely to generate your response.',
      },
      {
        label: 'Human-in-the-Loop Writes:',
        text: 'AI suggestions that create, modify, or delete calendar entries or tasks require your review and confirmation before modifying local records.',
      },
    ],
    callout: {
      tone: 'info',
      title: 'Avoid Sharing Highly Sensitive Data',
      text: 'Do not enter government ID numbers, passwords, banking or payment details, medical records, or confidential personal information belonging to others into AI prompts, notes, or uploads.',
    },
  },
  {
    id: 'third-parties',
    title: '5. Service Providers & No Data Selling',
    icon: 'users',
    summary:
      'LAFINA does not sell, rent, or trade your personal data, and contains no third-party advertising or cross-app ad-tracking SDKs.',
    bullets: [
      {
        label: 'Essential Sub-Processors:',
        text: 'Optional online features rely on vetted infrastructure providers for cloud API hosting and database storage, third-party cloud AI and speech providers for online responses and voice, and official release servers (GitHub Releases) to check and download signed app updates.',
      },
      {
        label: 'Purpose Limitation:',
        text: 'Data shared with service providers is restricted to what is necessary to fulfill the feature you request and is governed by each provider’s security and privacy terms.',
      },
    ],
  },
  {
    id: 'permissions',
    title: '6. Device Permissions & What We Never Access',
    icon: 'smartphone',
    summary:
      'Every Android permission requested by LAFINA maps to a specific student-facing feature and can be revoked in your phone settings.',
    bullets: [
      {
        label: 'Microphone:',
        text: 'Used only when you actively tap Push-to-Talk, answer a simulated reminder call, or start a meeting recording.',
      },
      {
        label: 'Alarms, Notifications, Full-Screen Alerts & Boot:',
        text: 'Used to ring exact alarms, focus timers, and reminder alerts on time, and to reschedule them after your phone restarts.',
      },
      {
        label: 'Display Over Other Apps (Floating LAFINA):',
        text: 'Optional and off by default. Displays only the floating LAFINA orb and Quick Chat overlay. LAFINA never reads, scrapes, records, or inspects content from other apps on your screen.',
      },
      {
        label: 'Install Unknown Apps (In-App Updates):',
        text: 'Optional. Hands a cryptographically verified update package to Android’s installer, which always asks you to confirm before installing.',
      },
      {
        label: 'Never Accessed:',
        text: 'LAFINA does not access your GPS location, SMS messages, contacts list, real phone call logs, or biometric sensors.',
      },
    ],
  },
  {
    id: 'security',
    title: '7. Data Security & Safeguards',
    icon: 'lock',
    summary:
      'We apply layered safeguards designed to protect your local database and optional cloud traffic.',
    bullets: [
      {
        label: 'Technical Controls:',
        text: 'HTTPS/TLS encryption for all cloud requests, Android secure keystore storage for session tokens, disabled OS auto-backup (allowBackup=false) so local SQLite files are not silently copied out, and signature verification for in-app updates.',
      },
      {
        label: 'Security Limitations:',
        text: 'As an academic capstone project, while we take reasonable technical and organizational steps to protect your data, no electronic storage or internet transmission is 100% immune to risk. Please protect your phone with a screen lock and use a strong, unique password.',
      },
    ],
  },
  {
    id: 'retention-rights',
    title: '8. Data Retention, Deletion & Your Rights',
    icon: 'trash',
    summary:
      'You remain in control of your academic data, with rights aligned with the Philippine Data Privacy Act of 2012 (Republic Act No. 10173).',
    bullets: [
      {
        label: 'Clear Local Data Anytime:',
        text: 'Use Profile → Clear All Data (and type DELETE to confirm) to permanently erase local notes, tasks, events, reminders, time blocks, chats, and event defaults. Appearance settings and offline voice preferences stay on the device unless reset separately.',
      },
      {
        label: 'Cloud Deletion:',
        text: 'Clearing chats while signed in deletes synced cloud chat history. To request permanent deletion of your cloud account and synced server records, contact the LAFINA development team.',
      },
      {
        label: 'Your Privacy Rights (RA 10173):',
        text: 'Subject to applicable law, you have the right to be informed, to access and correct your personal data, to object or opt out of optional online features (via Guest/Offline Mode, Chat Sync toggles, or Android permission settings), to request erasure, and to export your calendar data.',
      },
    ],
  },
  {
    id: 'disclaimers',
    title: '9. Academic Disclaimers & Limitation of Liability',
    icon: 'alert',
    summary:
      'Please review these important boundaries before relying on LAFINA for time-critical academic obligations.',
    bullets: [
      {
        label: 'Not an Official USTP Portal:',
        text: 'LAFINA is an independent student capstone project and is not an official portal, system, or representative of the University of Science and Technology of Southern Philippines (USTP). COR imports and USTP Student Handbook citations are personal study aids only and do not constitute official university verification.',
      },
      {
        label: 'AI & Extraction Accuracy:',
        text: 'AI replies, handbook citations, COR schedule extractions, transcripts, summaries, and generated documents may occasionally contain inaccuracies or outdated details. Always confirm grades, enrollment, deadlines, and policies through official USTP offices.',
      },
      {
        label: 'Alarm Delivery & "As Is" Basis:',
        text: 'Reliable alarms and reminders depend on Android battery optimization, Do Not Disturb settings, OS permissions, and device health. LAFINA is provided "as is" and "as available" without warranties of any kind.',
      },
    ],
    callout: {
      tone: 'warning',
      title: 'Limitation of Liability',
      text: 'To the fullest extent permitted by law, the LAFINA development team and project advisers are not liable for missed classes, exams, deadlines, alarms, inaccurate AI output, or data loss arising from device failure, OS restrictions, misconfiguration, or third-party service outages.',
    },
  },
  {
    id: 'eligibility',
    title: '10. Student Eligibility',
    icon: 'graduation',
    summary:
      'LAFINA is built for college and university students and learners aged 13 and older. Minors under 18 should use optional cloud account and online AI features with the awareness of a parent or legal guardian. We do not knowingly collect personal information from children under 13.',
  },
  {
    id: 'contact',
    title: '11. Policy Updates & Contact',
    icon: 'mail',
    summary:
      'We may revise this Privacy Policy as LAFINA adds features or adjusts data handling. Updates take effect on the Effective Date displayed at the top of this screen, and continued use of the app acknowledges the updated policy.',
    bullets: [
      {
        label: 'Development Team:',
        text: 'LAFINA Capstone Development Team, University of Science and Technology of Southern Philippines (USTP) – Cagayan de Oro.',
      },
      {
        label: 'Privacy & Account Requests:',
        text: 'For data access, correction, cloud account deletion requests, or privacy concerns, reach out via the official project repository (github.com/LAFINA-AI/LAFINA-CAPSTONE) or through your USTP capstone coordinator.',
      },
    ],
  },
];
