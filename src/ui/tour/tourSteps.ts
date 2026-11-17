import type {TabType} from '../components/CustomTabBar';

export type TourAnchor =
  | 'tab-chat'
  | 'tab-calendar'
  | 'tab-dashboard'
  | 'tab-notes'
  | 'tab-profile';

export interface TourStep {
  id: string;
  title: string;
  body: string;
  anchor?: TourAnchor;
  tab?: TabType;
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
    body: 'Your day at a glance: see what class or event is live or up next, spot open study blocks between classes, and customize which cards appear.',
    anchor: 'tab-dashboard',
    tab: 'dashboard',
  },
  {
    id: 'calendar',
    title: 'Schedule',
    body: 'Your classes, deadlines and study blocks in one place. Tap a day in the week strip to see it hour by hour, tap an empty hour or the + button to add something, and use Import to bring in a class schedule.',
    anchor: 'tab-calendar',
    tab: 'calendar',
  },
  {
    id: 'assistant',
    title: 'AI',
    body: 'The middle tab. Ask in plain language or hold the mic to speak — "block 2 to 4 pm for thesis writing tomorrow" — and LAFINA schedules it on this phone, even offline.',
    anchor: 'tab-chat',
    tab: 'chat',
  },
  {
    id: 'notes',
    title: 'Tools',
    body: 'Alarms, to-dos and lecture notes in one workspace. Set wake-up alarms, track tasks and capture study notes with checklists and images.',
    anchor: 'tab-notes',
    tab: 'notes',
  },
  {
    id: 'account',
    title: isGuest ? 'Your guest session' : 'Profile & settings',
    body: isGuest
      ? 'Guest data lives on this phone. Create an account from here when you want it on your other devices — nothing you have made is lost in the swap.'
      : 'Reminder preferences, dark mode and your photo all live here. Your data syncs when you are signed in and online.',
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
  /** USTP school features are on (confirmed COR). */
  schoolEnabled: boolean;
  /** Chose USTP but the COR is not reviewed yet. */
  corPending: boolean;
}

/**
 * The walkthrough after first-use setup (approved v3 journey): Home →
 * Schedule → AI inside the real app, skippable and replayable from Profile.
 * Copy adapts to the mode; USTP handbook features are mentioned only when
 * they are actually available.
 */
export const buildQuickTourSteps = ({
  schoolEnabled,
  corPending,
}: QuickTourAudience): TourStep[] => [
  {
    id: 'quick-home',
    title: 'Home',
    body: 'Your day at a glance: what is live or up next, open time between plans, and reminders.',
    anchor: 'tab-dashboard',
    tab: 'dashboard',
  },
  {
    id: 'quick-schedule',
    title: 'Schedule',
    body: schoolEnabled
      ? 'Your reviewed COR classes, deadlines and plans in one place. Tap an empty hour or + to add something.'
      : corPending
      ? 'Classes, deadlines and plans in one place. Add your COR from Profile when you are ready.'
      : 'Classes, deadlines and plans in one place. Tap an empty hour or + to add something.',
    anchor: 'tab-calendar',
    tab: 'calendar',
  },
  {
    id: 'quick-ai',
    title: 'AI',
    body: schoolEnabled
      ? 'Type or choose to speak — "remind me at 6 PM" — or ask about the USTP handbook, with sources you can check.'
      : 'Type or choose to speak — "remind me tomorrow at 6 PM" — and LAFINA plans it on this phone, even offline.',
    anchor: 'tab-chat',
    tab: 'chat',
  },
];
