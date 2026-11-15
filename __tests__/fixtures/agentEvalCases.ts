/**
 * Agent eval set (ADR-033): 52 realistic student requests in English and
 * Taglish, with the outcome a careful human would expect. Written by hand
 * from the request, not from what the parser does, so failures are real gaps.
 *
 * Reference time for every case: Saturday 14 Nov 2026, 09:00 local.
 * `intent` lists every acceptable intent; fields, when given, must match.
 */
import type {ParsedIntentType} from '../../src/ai/nlu/types';

export type EvalCategory =
  | 'create'
  | 'edit'
  | 'read'
  | 'taglish'
  | 'conversation'
  | 'reference';

export interface AgentEvalCase {
  id: string;
  category: EvalCategory;
  text: string;
  intent: ParsedIntentType[];
  date?: string | null;
  time?: string | null;
  endTime?: string | null;
  isCompleted?: boolean;
  /** Words the title must contain (lowercase). */
  titleHas?: string[];
  /**
   * Model fields for the agent path: what DeepSeek would pass to
   * prepare_lafina_action given the earlier conversation. Only for requests
   * that point at something said before.
   */
  agentFields?: Record<string, unknown>;
}

export const EVAL_REFERENCE = new Date(2026, 10, 14, 9, 0, 0);

export const AGENT_EVAL_CASES: AgentEvalCase[] = [
  // ── Creating (English) ────────────────────────────────────────────────
  {
    id: 'c01',
    category: 'create',
    text: 'remind me tomorrow at 7pm to review physics',
    intent: ['create_reminder'],
    date: '2026-11-15',
    time: '19:00',
    titleHas: ['physics'],
  },
  {
    id: 'c02',
    category: 'create',
    text: 'add a task to submit the lab report on Friday',
    intent: ['create_task'],
    date: '2026-11-20',
    titleHas: ['lab report'],
  },
  {
    id: 'c03',
    category: 'create',
    text: 'schedule a study session tomorrow from 2pm to 4pm',
    intent: ['create_time_block'],
    date: '2026-11-15',
    time: '14:00',
    endTime: '16:00',
  },
  {
    id: 'c04',
    category: 'create',
    text: 'I have a math quiz on Monday at 10am',
    intent: ['create_time_block', 'create_task'],
    date: '2026-11-16',
    time: '10:00',
    titleHas: ['quiz'],
  },
  {
    id: 'c05',
    category: 'create',
    text: 'note: bring calculator to the exam',
    intent: ['create_note'],
  },
  {
    id: 'c06',
    category: 'create',
    text: 'remind me in 30 minutes to stretch',
    intent: ['create_reminder'],
    date: '2026-11-14',
    time: '09:30',
    titleHas: ['stretch'],
  },
  {
    id: 'c07',
    category: 'create',
    text: 'add buy rice to my to-do list',
    intent: ['create_task'],
    date: null,
    titleHas: ['rice'],
  },
  {
    id: 'c08',
    category: 'create',
    text: 'set a reminder for my dentist appointment next Tuesday at 3pm',
    intent: ['create_reminder'],
    date: '2026-11-17',
    time: '15:00',
    titleHas: ['dentist'],
  },
  {
    id: 'c09',
    category: 'create',
    text: 'jot down that the quiz covers chapters 4 to 6',
    intent: ['create_note'],
  },
  {
    id: 'c10',
    category: 'create',
    text: 'block 3 hours on Sunday at 1pm for thesis writing',
    intent: ['create_time_block'],
    date: '2026-11-15',
    time: '13:00',
    endTime: '16:00',
    titleHas: ['thesis'],
  },

  // ── Changing existing items (English) ─────────────────────────────────
  {
    id: 'e01',
    category: 'edit',
    text: 'mark the lab report as done',
    intent: ['update_task'],
    isCompleted: true,
  },
  {
    id: 'e02',
    category: 'edit',
    text: 'move my study session to 5pm',
    intent: ['update_time_block'],
    time: '17:00',
  },
  {
    id: 'e03',
    category: 'edit',
    text: 'cancel my math tutorial tomorrow',
    intent: ['delete_time_block'],
  },
  {
    id: 'e04',
    category: 'edit',
    text: 'pin my exam note',
    intent: ['update_note'],
  },
  {
    id: 'e05',
    category: 'edit',
    text: 'delete the note about the calculator',
    intent: ['delete_note'],
  },
  {
    id: 'e06',
    category: 'edit',
    text: 'reopen the lab report task',
    intent: ['update_task'],
    isCompleted: false,
  },
  {
    id: 'e07',
    category: 'edit',
    text: 'change the essay deadline to Wednesday',
    intent: ['update_task'],
    date: '2026-11-18',
  },
  {
    id: 'e08',
    category: 'edit',
    text: 'delete the buy rice task',
    intent: ['delete_task'],
  },

  // ── Reading (English) ─────────────────────────────────────────────────
  {
    id: 'r01',
    category: 'read',
    text: "what's on my schedule tomorrow?",
    intent: ['query_schedule'],
  },
  {
    id: 'r02',
    category: 'read',
    text: 'do I have anything on Monday?',
    intent: ['query_schedule'],
  },
  {
    id: 'r03',
    category: 'read',
    text: 'find a free slot tomorrow for 2 hours',
    intent: ['query_schedule'],
    date: '2026-11-15',
  },
  {
    id: 'r04',
    category: 'read',
    text: 'what tasks are overdue?',
    intent: ['query_schedule'],
  },
  {
    id: 'r05',
    category: 'read',
    text: "what's my next class?",
    intent: ['query_schedule'],
  },
  {
    id: 'r06',
    category: 'read',
    text: 'search my notes for photosynthesis',
    intent: ['query_notes'],
  },
  {
    id: 'r07',
    category: 'read',
    text: 'show my to-do list',
    intent: ['query_schedule', 'query_notes'],
  },
  {
    id: 'r08',
    category: 'read',
    text: 'when am I free on Monday?',
    intent: ['query_schedule'],
  },

  // ── Taglish ───────────────────────────────────────────────────────────
  {
    id: 't01',
    category: 'taglish',
    text: 'paalala bukas ng 7pm na mag-review ng physics',
    intent: ['create_reminder'],
    date: '2026-11-15',
    time: '19:00',
  },
  {
    id: 't02',
    category: 'taglish',
    text: 'pa-remind ako mamaya 5pm na mag-submit ng essay',
    intent: ['create_reminder'],
    date: '2026-11-14',
    time: '17:00',
  },
  {
    id: 't03',
    category: 'taglish',
    text: 'lagay mo sa to-do ko yung pagbili ng bigas',
    intent: ['create_task'],
    titleHas: ['bigas'],
  },
  {
    id: 't04',
    category: 'taglish',
    text: 'may quiz ako sa Lunes ng 10am',
    intent: ['create_time_block', 'create_task'],
    date: '2026-11-16',
    time: '10:00',
  },
  {
    id: 't05',
    category: 'taglish',
    text: 'ano schedule ko bukas?',
    intent: ['query_schedule'],
  },
  {
    id: 't06',
    category: 'taglish',
    text: 'i-cancel mo yung study session bukas',
    intent: ['delete_time_block'],
  },
  {
    id: 't07',
    category: 'taglish',
    text: 'tapos na yung lab report',
    intent: ['update_task'],
    isCompleted: true,
  },
  {
    id: 't08',
    category: 'taglish',
    text: 'remind mo ako in 15 minutes mag-stretch',
    intent: ['create_reminder'],
    date: '2026-11-14',
    time: '09:15',
  },
  {
    id: 't09',
    category: 'taglish',
    text: 'gawa ka ng note: dalhin ang calculator',
    intent: ['create_note'],
  },
  {
    id: 't10',
    category: 'taglish',
    text: 'free ba ako sa Biyernes?',
    intent: ['query_schedule'],
  },

  // ── Conversation: nothing should change ───────────────────────────────
  {
    id: 'v01',
    category: 'conversation',
    text: 'explain photosynthesis',
    intent: ['chat'],
  },
  {
    id: 'v02',
    category: 'conversation',
    text: 'how do I study better for exams?',
    intent: ['chat'],
  },
  {
    id: 'v03',
    category: 'conversation',
    text: 'thanks!',
    intent: ['chat', 'acknowledge'],
  },
  {
    id: 'v04',
    category: 'conversation',
    text: 'what is the grading system in USTP?',
    intent: ['chat', 'out_of_scope'],
  },
  {
    id: 'v05',
    category: 'conversation',
    text: 'can you help me fit physics review into my Monday?',
    intent: ['chat'],
  },
  {
    id: 'v06',
    category: 'conversation',
    text: 'what should I prioritize this week?',
    intent: ['chat', 'query_schedule'],
  },

  // ── Pointing at something said earlier (agent territory) ──────────────
  {
    id: 'x01',
    category: 'reference',
    text: 'book the first one',
    intent: ['chat'],
    agentFields: {
      action: 'create_time_block',
      title: 'Physics review',
      date: '2026-11-16',
      time: '07:00',
      endTime: '09:00',
    },
  },
  {
    id: 'x02',
    category: 'reference',
    text: 'move it to 4pm',
    intent: ['chat', 'update_task', 'update_time_block'],
    agentFields: {
      action: 'update_time_block',
      title: 'Physics review',
      time: '16:00',
    },
  },
  {
    id: 'x03',
    category: 'reference',
    text: 'help me plan my study time for the physics exam',
    intent: ['chat'],
  },
  {
    id: 'x04',
    category: 'reference',
    text: 'add that to my calendar',
    intent: ['chat'],
    agentFields: {
      action: 'create_event',
      title: 'Org meeting',
      date: '2026-11-18',
      time: '15:00',
      endTime: '16:00',
    },
  },
  {
    id: 'x05',
    category: 'reference',
    text: 'schedule the same thing next week',
    intent: ['chat'],
    agentFields: {
      action: 'create_time_block',
      title: 'Physics review',
      date: '2026-11-23',
      time: '07:00',
      endTime: '09:00',
    },
  },
  {
    id: 'x06',
    category: 'reference',
    text: 'remind me about it later',
    intent: ['chat'],
    agentFields: {
      action: 'create_reminder',
      title: 'Submit the essay',
      date: '2026-11-14',
      time: '17:00',
    },
  },
  {
    id: 'x07',
    category: 'reference',
    text: 'yung una na lang',
    intent: ['chat'],
    agentFields: {
      action: 'create_time_block',
      title: 'Physics review',
      date: '2026-11-16',
      time: '07:00',
      endTime: '09:00',
    },
  },
  {
    id: 'x08',
    category: 'reference',
    text: 'sige, i-mark mo nang tapos yun',
    intent: ['chat', 'update_task'],
    agentFields: {action: 'complete_task', title: 'Lab report'},
  },
  {
    id: 'x09',
    category: 'reference',
    text: 'I have a physics exam on Tuesday, help me plan my study time',
    intent: ['chat', 'create_time_block'],
  },
  {
    id: 'x10',
    category: 'reference',
    text: 'do the same for chemistry',
    intent: ['chat'],
    agentFields: {
      action: 'create_time_block',
      title: 'Chemistry review',
      date: '2026-11-17',
      time: '07:00',
      endTime: '09:00',
    },
  },
];
