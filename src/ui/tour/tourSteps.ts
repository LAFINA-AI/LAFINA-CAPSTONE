import type {TabType} from '../components/CustomTabBar';

export type TourAnchor =
  | 'tab-chat'
  | 'tab-calendar'
  | 'tab-dashboard'
  | 'tab-notes'
  | 'tab-profile'
  | 'home-actions'
  | 'calendar-add-button'
  | 'calendar-more-button'
  | 'chat-engine-pill'
  | 'chat-composer'
  | 'tools-subtab-alarms'
  | 'tools-subtab-todo'
  | 'tools-subtab-notes'
  | 'profile-floating-row';

export type TourNotesSubTab = 'alarms' | 'todo' | 'notes';

export interface TourHighlight {
  label: string;
  detail: string;
}

export interface TourStep {
  id: string;
  section?: TabType;
  sectionLabel?: string;
  title: string;
  body: string;
  highlights?: TourHighlight[];
  tip?: string;
  anchor?: TourAnchor;
  fallbackAnchor?: TourAnchor;
  tab?: TabType;
  notesSubTab?: TourNotesSubTab;
}

export interface TourAudience {
  isGuest: boolean;
  isPro: boolean;
}

export const buildTourSteps = ({isGuest}: TourAudience): TourStep[] => [
  {
    id: 'welcome',
    title: 'Welcome to LAFINA',
    body: isGuest
      ? 'You are using LAFINA as a guest, so everything you do stays on this phone. Here is a quick look around — it takes about a minute.'
      : 'Your account is ready. Here is a quick look around — it takes about a minute, and you can skip it at any point.',
  },
  {
    id: 'dashboard',
    title: 'Home',
    body: 'Your day at a glance: see what class or event is live or up next, spot open study blocks between classes, check your next alarm, and customize which cards appear.',
    anchor: 'tab-dashboard',
    tab: 'dashboard',
  },
  {
    id: 'calendar',
    title: 'Schedule',
    body: 'See your classes and deadlines by month, week or day. Tap an empty hour or + to add something.',
    anchor: 'tab-calendar',
    tab: 'calendar',
  },
  {
    id: 'assistant',
    title: 'AI',
    body: 'Ask in plain language, hold the mic for offline speech, or tap the phone icon for live Call LAFINA. Every planner change opens a review card before saving.',
    anchor: 'tab-chat',
    tab: 'chat',
  },
  {
    id: 'notes',
    title: 'Skills',
    body: 'Device-local Alarms with Morning Briefing, To-Do lists synced with note checklists, and rich Markdown Notes with image attachments and AI Assist.',
    anchor: 'tab-notes',
    tab: 'notes',
  },
  {
    id: 'account',
    title: isGuest ? 'Your guest session' : 'Profile & settings',
    body: isGuest
      ? 'As a guest, your data stays on this phone. Create an account anytime to use it on other phones too. Nothing is lost.'
      : 'Floating LAFINA, voices, memory, Alarm & Reminder Health, dark mode and color themes all live here. Your data syncs when signed in and online.',
    anchor: 'tab-profile',
    tab: 'profile',
  },
  {
    id: 'done',
    title: 'That is the tour',
    body: 'Everything is stored on this phone first, so LAFINA works with no connection. You can run this walkthrough again any time from Profile.',
  },
];

export interface QuickTourAudience {
  /** True for local_guest_user (data stays local until an account is linked). */
  isGuest?: boolean;
  /** USTP school features are on (confirmed COR). */
  schoolEnabled: boolean;
  /** Chose USTP but the COR is not reviewed yet. */
  corPending: boolean;
}

/**
 * Comprehensive feature walkthrough across all 5 tabs and key capabilities:
 * Home → Schedule → AI & Calls → Tools (Alarms / To-Do / Notes) → Floating & Profile.
 * Copy adapts honestly to guest/signed-in and COR eligibility state.
 */
export const buildWalkthroughSteps = ({
  isGuest = false,
  schoolEnabled,
  corPending,
}: QuickTourAudience): TourStep[] => [
  {
    id: 'home-overview',
    section: 'dashboard',
    sectionLabel: 'Home',
    title: 'Your day at a glance',
    body: 'Home brings live schedules, due tasks, alarms and pinned notes together — saved on this phone first so it works offline.',
    highlights: [
      {
        label: 'Up Next countdown card',
        detail:
          'Shows what class, event, alarm or task is live or next with a live countdown ring and time remaining.',
      },
      {
        label: 'Quick Actions',
        detail:
          'Add a task, set an alarm, jump into a Focus session, or open Ask USTP directly from Home.',
      },
      {
        label: 'Live Today timeline',
        detail:
          'Tracks finished sessions, live free-time gaps with one-tap Focus, and what is coming up next.',
      },
    ],
    anchor: 'tab-dashboard',
    tab: 'dashboard',
  },
  {
    id: 'home-study-customize',
    section: 'dashboard',
    sectionLabel: 'Home',
    title: 'Free study gaps & custom layout',
    body: 'Spot open time between classes and tailor which cards appear on your Home screen.',
    highlights: [
      {
        label: 'Free Study Blocks',
        detail:
          'Automatically detects usable gaps today — tap + Study to turn a gap into a planned study block.',
      },
      {
        label: 'Customize Dashboard',
        detail:
          'Tap the sliders icon to apply presets (Balanced, Class Focus, Exam Crunch), reorder cards or hide widgets.',
      },
    ],
    anchor: 'home-actions',
    fallbackAnchor: 'tab-dashboard',
    tab: 'dashboard',
  },
  {
    id: 'schedule-planner',
    section: 'calendar',
    sectionLabel: 'Schedule',
    title: 'Month, Week & Day planning',
    body: 'Switch views cleanly, pick any date, jump back to Today, and manage overdue items in one place.',
    highlights: [
      {
        label: '+ Create anything',
        detail:
          'Tap + to add a Class / Event, Time Block, Task or Note — or tap any empty hour in Day view.',
      },
      {
        label: 'Tap items for details',
        detail:
          'Inspect timing and room, edit or mark complete, and attach notes or to-dos directly to that session.',
      },
    ],
    anchor: 'calendar-add-button',
    fallbackAnchor: 'tab-calendar',
    tab: 'calendar',
  },
  {
    id: 'schedule-cor-groups',
    section: 'calendar',
    sectionLabel: 'Schedule',
    title: 'COR classes, Groups & .ics files',
    body: 'Open the top-right menu in Schedule to manage classes, layers and calendar files.',
    highlights: [
      {
        label: 'Classes & USTP COR',
        detail:
          'Inspect or edit repeating classes in View Classes, or import a reviewed USTP COR (PDF, photo or text).',
      },
      {
        label: 'Calendar Groups',
        detail:
          'Toggle Classes, Birthdays, Philippine Holidays, or create custom color groups like Exams, Org or Gym.',
      },
      {
        label: 'Undated tasks & .ics',
        detail:
          'Review tasks without due dates, and import or export .ics calendar files anytime.',
      },
    ],
    anchor: 'calendar-more-button',
    fallbackAnchor: 'tab-calendar',
    tab: 'calendar',
  },
  {
    id: 'ai-chat-review',
    section: 'chat',
    sectionLabel: 'AI',
    title: 'Plan by text or offline voice',
    body: 'Ask in plain English or Taglish to read your day or create, update and organize plans — even multiple items at once.',
    highlights: [
      {
        label: 'Hold Mic to speak offline',
        detail: 'Works with no internet. Slide left or up to cancel.',
      },
      {
        label: 'Confirm before save',
        detail:
          'Every write or deletion opens a Review Card so you can inspect, edit fields, confirm or undo.',
      },
    ],
    anchor: 'tab-chat',
    tab: 'chat',
  },
  {
    id: 'ai-engine-handbook',
    section: 'chat',
    sectionLabel: 'AI',
    title: 'AI Engine, Scanner & Ask USTP',
    body: 'Switch AI modes from the top pill, scan schedules from images, or ask about USTP policies, dates and offices.',
    highlights: [
      {
        label: 'Offline & Online AI',
        detail:
          'Tap the top pill to switch between offline AI on your phone and online AI.',
      },
      {
        label: 'Scanner, History & Temp Chat',
        detail:
          'Tap + to scan a timetable from Camera/Photos, open the menu for History & Command Guide, or use Temporary Chat.',
      },
      {
        label: 'Ask USTP',
        detail: schoolEnabled
          ? 'Open Ask USTP from the sidebar for offline and online answers with checkable chapter and page citations and official links. Tap See passages under an answer to read its sources.'
          : corPending
          ? 'Add and confirm your USTP COR in Profile or Schedule to unlock Ask USTP with cited answers.'
          : 'Ask USTP stays off in Scheduling mode — switch anytime in Profile → Student Setup.',
      },
    ],
    anchor: 'chat-engine-pill',
    fallbackAnchor: 'tab-chat',
    tab: 'chat',
  },
  {
    id: 'ai-calls-reminders',
    section: 'chat',
    sectionLabel: 'AI',
    title: 'Call LAFINA & Reminder Calls',
    body: 'Talk hands-free in real time and choose how time-critical reminders reach you.',
    highlights: [
      {
        label: 'Live Call LAFINA',
        detail:
          'Tap the phone icon to converse naturally (Online Mode when signed in), interrupt mid-reply, type, or minimize to a mini bar.',
      },
      {
        label: 'Call me vs Notify only',
        detail:
          'Reminders can trigger a simulated incoming call (talk online or tap Acknowledge / Snooze offline) or a quiet notification.',
      },
      {
        label: 'Safe alert status',
        detail:
          'Acknowledging a reminder confirms you received it — your task stays open until you mark it done.',
      },
    ],
    anchor: 'chat-composer',
    fallbackAnchor: 'tab-chat',
    tab: 'chat',
  },
  {
    id: 'tools-alarms',
    section: 'notes',
    sectionLabel: 'Skills',
    title: 'Alarms & Morning Briefing',
    body: 'Clock alarms that live on this phone, separate from your synced reminders.',
    highlights: [
      {
        label: 'Reliable wake-ups',
        detail:
          'Rings even when the app is closed or after a restart, with weekday repeats, vibration and custom snooze.',
      },
      {
        label: 'Morning Briefing',
        detail:
          'Enable Morning Briefing on an alarm and LAFINA reads today’s actual schedule aloud offline after you dismiss it.',
      },
    ],
    anchor: 'tools-subtab-alarms',
    fallbackAnchor: 'tab-notes',
    tab: 'notes',
    notesSubTab: 'alarms',
  },
  {
    id: 'tools-todo',
    section: 'notes',
    sectionLabel: 'Skills',
    title: 'To-Do lists & synced note checklists',
    body: 'Capture quick errands, manage scheduled deadlines, and check off tasks written inside your study notes.',
    highlights: [
      {
        label: 'Quick-add & priorities',
        detail:
          'Add undated tasks in seconds, cycle High / Medium / Low priority, or attach due times and reminders.',
      },
      {
        label: 'From Notes filter',
        detail:
          'Interactive checklists inside your Notes automatically appear in From Notes and stay synced both ways.',
      },
    ],
    anchor: 'tools-subtab-todo',
    fallbackAnchor: 'tab-notes',
    tab: 'notes',
    notesSubTab: 'todo',
  },
  {
    id: 'tools-notes',
    section: 'notes',
    sectionLabel: 'Skills',
    title: 'Rich Notes & AI Note Assistant',
    body: 'Capture structured class notes offline with Markdown formatting, images, pins and built-in AI helpers.',
    highlights: [
      {
        label: 'Markdown, images & categories',
        detail:
          'Format headings, bold, highlight, code, quotes and checklists, toggle Write/Preview, pin notes, color categories and attach photos.',
      },
      {
        label: 'AI Assist in editor',
        detail:
          'Tap AI Assist to Summarize key takeaways, Clean Up spacing, or Extract Tasks straight to To-Do.',
      },
    ],
    anchor: 'tools-subtab-notes',
    fallbackAnchor: 'tab-notes',
    tab: 'notes',
    notesSubTab: 'notes',
  },
  {
    id: 'profile-floating',
    section: 'profile',
    sectionLabel: 'Profile',
    title: 'Floating LAFINA & Quick Chat',
    body: 'Turn on an optional floating Edge Bar or Bubble (off by default) to plan over any app without switching screens.',
    highlights: [
      {
        label: 'Quick Chat anywhere',
        detail:
          'Tap or swipe inward from browsers, PDFs or chats to add tasks, reminders, events or notes with Confirm-before-save.',
      },
      {
        label: 'Custom & private',
        detail:
          'Choose Edge Bar or Bubble, tune size, color, opacity, Tuck and Lock — never reads your screen or listens in the background.',
      },
    ],
    anchor: 'profile-floating-row',
    fallbackAnchor: 'tab-profile',
    tab: 'profile',
  },
  {
    id: 'profile-sync-health-themes',
    section: 'profile',
    sectionLabel: 'Profile',
    title: 'Sync, Voices, Health & Themes',
    body: 'Everything saves locally first. Configure how LAFINA syncs, speaks, looks and checks alarm reliability.',
    highlights: [
      {
        label: isGuest ? 'Guest data & upgrade' : 'Cross-device Cloud Sync',
        detail: isGuest
          ? 'Guest work stays on this phone. Create an account in Profile anytime to sync across devices without losing data.'
          : 'Tasks, events, blocks, reminders, notes, categories and profile sync automatically when signed in and online.',
      },
      {
        label: 'Preferences, Memory & Voices',
        detail:
          'Reminder timing, what LAFINA remembers, voices and your school setup.',
      },
      {
        label: 'Health & Appearance',
        detail:
          'Use "Check my reminders work" to fix alarm permissions, and pick dark mode or a color theme.',
      },
    ],
    tip: 'Replay this tour anytime from Profile → Show the walkthrough again.',
    anchor: 'tab-profile',
    tab: 'profile',
  },
];

export const buildQuickTourSteps = (audience: QuickTourAudience): TourStep[] =>
  buildWalkthroughSteps(audience);
