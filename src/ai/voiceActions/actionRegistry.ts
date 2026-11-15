/**
 * Tool Registry and Function Definitions for ElevenAgents / DeepSeek (P06-01, P06-02).
 *
 * Defines authoritative, typed tool schemas and dispatches incoming client_tool_call
 * events. Rejects unknown tool names with safe fallback responses.
 */

import type {LafinaActionKind} from './types';

export interface ToolParameterSchema {
  type: string;
  description?: string;
  properties?: Record<string, unknown>;
  required?: string[];
  items?: Record<string, unknown>;
}

/**
 * Planner changes the model may describe in fields (see `structuredAction.ts`).
 * Deletion is left out on purpose: removing data needs the student's own words.
 */
export const STRUCTURED_ACTIONS = [
  'create_task',
  'create_event',
  'create_time_block',
  'create_reminder',
  'create_note',
  'update_task',
  'update_time_block',
  'update_note',
  'complete_task',
  'reopen_task',
];

export interface RegisteredToolDefinition {
  name: string;
  kind: LafinaActionKind;
  description: string;
  parameters: ToolParameterSchema;
}

export const REGISTERED_TOOLS: readonly RegisteredToolDefinition[] = [
  {
    name: 'read_lafina_data',
    kind: 'legacy.read_data',
    description:
      'Reads the student’s schedule/calendar, to-do list, saved notes, or personal memories from local device storage.',
    parameters: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: ['calendar', 'todos', 'notes', 'memory'],
          description: 'The type of local student data to read.',
        },
        query: {
          type: 'string',
          description:
            'Optional search query, title, or date (YYYY-MM-DD, today, tomorrow).',
        },
      },
      required: ['kind'],
    },
  },
  {
    name: 'prepare_lafina_action',
    kind: 'legacy.prepare_action',
    description:
      'Prepares a to-do, task, event, time block, reminder, or note review card (creation, completion, edit, or deletion) for student confirmation. Nothing is saved until confirmed. The app first reads the student’s own words; fill the structured fields too when the details came from earlier in the conversation (for example a free time you found), so the card can still be prepared. Deleting needs the student’s own words.',
    parameters: {
      type: 'object',
      properties: {
        request: {
          type: 'string',
          description:
            'The natural language description of the item to prepare.',
        },
        action: {
          type: 'string',
          enum: STRUCTURED_ACTIONS,
          description:
            'Optional. What to prepare when the details came from the conversation.',
        },
        title: {
          type: 'string',
          description:
            'Optional. Short title of the new item, or of the existing item to change.',
        },
        date: {type: 'string', description: 'Optional. Date (YYYY-MM-DD).'},
        time: {
          type: 'string',
          description: 'Optional. Start or due time (HH:MM, 24-hour).',
        },
        endTime: {
          type: 'string',
          description: 'Optional. End time (HH:MM, 24-hour).',
        },
        durationMinutes: {
          type: 'number',
          description: 'Optional. Length in minutes (5..720).',
        },
        priority: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
          description: 'Optional. Task priority.',
        },
        newTitle: {
          type: 'string',
          description: 'Optional. New title when renaming an existing item.',
        },
        details: {
          type: 'string',
          description: 'Optional. Note text or extra details.',
        },
        deliveryStyle: {
          type: 'string',
          enum: ['call', 'notify'],
          description:
            'Optional. For reminders: "call" rings a reminder call, "notify" posts an ordinary notification.',
        },
      },
      required: ['request'],
    },
  },
  {
    name: 'find_free_time',
    kind: 'calendar.free_time',
    description:
      'Finds free windows on one day between 7:00 AM and 10:00 PM that fit a session of the given length, using the student’s local calendar. Read-only.',
    parameters: {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          description: 'Day to check (YYYY-MM-DD). Defaults to today.',
        },
        durationMinutes: {
          type: 'number',
          description: 'Session length in minutes (15..720). Defaults to 60.',
        },
      },
    },
  },
  {
    name: 'snooze_reminder',
    kind: 'reminder.snooze',
    description:
      'Snoozes the reminder this reminder call is about. Only works during a reminder call; use it when the student asks to be reminded again later.',
    parameters: {
      type: 'object',
      properties: {
        minutes: {
          type: 'number',
          description: 'Minutes to snooze (1..120). Defaults to 10.',
        },
      },
    },
  },
  {
    name: 'save_lafina_memory',
    kind: 'legacy.save_memory',
    description:
      'Proposes saving an explicit student memory or preference. Stated clearly in a card; nothing is saved without confirmation.',
    parameters: {
      type: 'object',
      properties: {
        request: {
          type: 'string',
          description:
            'The explicit fact or preference the student requested to remember.',
        },
      },
      required: ['request'],
    },
  },
  {
    name: 'read_calendar',
    kind: 'calendar.read',
    description:
      'Reads local student calendar events and tasks within a date window.',
    parameters: {
      type: 'object',
      properties: {
        query: {type: 'string', description: 'Filter by title or keyword.'},
        date: {type: 'string', description: 'Specific date (YYYY-MM-DD).'},
        start: {type: 'string', description: 'Start date (YYYY-MM-DD).'},
        end: {type: 'string', description: 'End date (YYYY-MM-DD).'},
      },
    },
  },
  {
    name: 'search_notes',
    kind: 'note.search',
    description: 'Searches local student notes by title or content.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search term (max 100 characters).',
        },
        limit: {
          type: 'number',
          description: 'Max number of results to return (1..50).',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'read_memories',
    kind: 'memory.read',
    description:
      'Reads saved student memories and personal study preferences from local storage.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Optional search keyword to match memories.',
        },
      },
    },
  },
  {
    name: 'prepare_memory',
    kind: 'memory.prepare',
    description:
      'Proposes saving an explicit student fact or preference. Prepares a card for user confirmation before saving.',
    parameters: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'The fact or preference to remember (1..200 chars).',
        },
      },
      required: ['text'],
    },
  },
  {
    name: 'revise_draft',
    kind: 'draft.revise',
    description:
      'Modifies an existing in-progress draft card (e.g. changing date, time, title, or duration) before confirmation.',
    parameters: {
      type: 'object',
      properties: {
        cardId: {
          type: 'string',
          description: 'The stable card ID of the draft to revise.',
        },
        revision: {
          type: 'number',
          description: 'The current revision number of the draft.',
        },
        instruction: {
          type: 'string',
          description: 'The spoken instruction describing what to change.',
        },
      },
      required: ['cardId', 'revision', 'instruction'],
    },
  },
  {
    name: 'confirm_draft',
    kind: 'draft.confirm',
    description:
      'Confirms and commits the pending draft card to the student database.',
    parameters: {
      type: 'object',
      properties: {
        cardId: {
          type: 'string',
          description: 'The stable card ID of the draft to confirm.',
        },
        revision: {
          type: 'number',
          description: 'The revision number being confirmed.',
        },
      },
      required: ['cardId', 'revision'],
    },
  },
  {
    name: 'cancel_draft',
    kind: 'draft.cancel',
    description:
      'Cancels the pending draft card without modifying the student database.',
    parameters: {
      type: 'object',
      properties: {
        cardId: {
          type: 'string',
          description: 'The stable card ID of the draft to cancel.',
        },
        revision: {
          type: 'number',
          description: 'The current revision number of the draft.',
        },
      },
      required: ['cardId', 'revision'],
    },
  },
  {
    name: 'prepare_multi_action',
    kind: 'multi.prepare',
    description:
      'Prepares a grouped batch of student actions (tasks, calendar events, reminders) for review and confirmation.',
    parameters: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'Grouped spoken instruction or description of actions.',
        },
        items: {
          type: 'array',
          description: 'Optional structured list of actions.',
          items: {
            type: 'object',
            properties: {
              kind: {
                type: 'string',
                enum: ['task', 'event', 'reminder', 'note'],
              },
              title: {type: 'string'},
              date: {type: 'string'},
              time: {type: 'string'},
              endTime: {type: 'string'},
              priority: {type: 'string'},
              body: {type: 'string'},
            },
            required: ['kind', 'title'],
          },
        },
      },
    },
  },
  {
    name: 'propose_follow_up_reminder',
    kind: 'reminder.prepare',
    description:
      'Proposes a context-driven follow-up reminder for an event or task with explicit user confirmation.',
    parameters: {
      type: 'object',
      properties: {
        title: {type: 'string', description: 'Reminder text.'},
        parentTitle: {
          type: 'string',
          description: 'Title of the parent event or task.',
        },
        date: {type: 'string', description: 'Date (YYYY-MM-DD).'},
        time: {type: 'string', description: 'Time (HH:MM).'},
        minutesBefore: {
          type: 'number',
          description: 'Minutes before parent event to trigger reminder.',
        },
      },
      required: ['parentTitle'],
    },
  },
];

const TOOL_MAP = new Map<string, RegisteredToolDefinition>(
  REGISTERED_TOOLS.map(t => [t.name, t]),
);

export function getRegisteredTool(
  name: string,
): RegisteredToolDefinition | undefined {
  return TOOL_MAP.get(name);
}

export function isToolSupported(name: string): boolean {
  return TOOL_MAP.has(name);
}

export function listSupportedToolNames(): string[] {
  return REGISTERED_TOOLS.map(t => t.name);
}
