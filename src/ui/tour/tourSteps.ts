import type { TabType } from '../components/CustomTabBar';

export type TourAnchor = 'tab-chat' | 'tab-calendar' | 'tab-notes' | 'tab-profile' | 'mic';

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

export const buildTourSteps = ({ isGuest }: TourAudience): TourStep[] => [
  {
    id: 'welcome',
    title: 'Welcome to LAFINA',
    body: isGuest
      ? 'You are using LAFINA as a guest, so everything you do stays on this phone. Here is a quick look around — it takes about a minute.'
      : 'Your account is ready. Here is a quick look around — it takes about a minute, and you can skip it at any point.',
  },
  {
    id: 'calendar',
    title: 'Calendar',
    body: 'Your classes, deadlines and study blocks in one place. Tap a day in the week strip to see it hour by hour, tap an empty hour or the + button to add something, and use Import to bring in a class schedule.',
    anchor: 'tab-calendar',
    tab: 'calendar',
  },
  {
    id: 'notes',
    title: 'Notes',
    body: 'Lecture notes with headings, checklists and images. Pin the ones you keep coming back to, and search or filter by category to find the rest.',
    anchor: 'tab-notes',
    tab: 'notes',
  },
  {
    id: 'assistant',
    title: 'Chat',
    body: 'Ask in plain language — "block 2 to 4 pm for thesis writing tomorrow" — and LAFINA schedules it. Scheduling runs on this phone, so it works with no connection.',
    anchor: 'tab-chat',
    tab: 'chat',
  },
  {
    id: 'voice',
    title: 'Talk to it',
    body: 'Tap the mic to speak instead of typing: dictate a note, or say what you want scheduled. Your voice is transcribed on this phone and never uploaded.',
    anchor: 'mic',
  },
  {
    id: 'account',
    title: isGuest ? 'Your guest session' : 'Profile & settings',
    body: isGuest
      ? 'Guest data lives on this phone. Create an account from here when you want it on your other devices — nothing you have made is lost in the swap.'
      : 'Reminder preferences, time format, dark mode and your photo all live here. Your data syncs when you are signed in and online.',
    anchor: 'tab-profile',
    tab: 'profile',
  },
  {
    id: 'done',
    title: 'That is the tour',
    body: 'Everything is stored on this phone first, so LAFINA works with no connection. You can run this walkthrough again any time from Profile.',
  },
];
