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
      'Reads the student’s schedule/calendar, saved notes, or personal memories from local device storage.',
    parameters: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: ['calendar', 'notes', 'memory'],
          description: 'The type of local student data to read.',
        },
        query: {
          type: 'string',
          description: 'Optional search query, title, or date (YYYY-MM-DD, today, tomorrow).',
        },
      },
      required: ['kind'],
    },
  },
  {
    name: 'prepare_lafina_action',
    kind: 'legacy.prepare_action',
    description:
      'Prepares a task, event, time block, reminder, or note review card for student confirmation. Nothing is saved until confirmed.',
    parameters: {
      type: 'object',
      properties: {
        request: {
          type: 'string',
          description: 'The natural language description of the item to prepare.',
        },
      },
      required: ['request'],
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
          description: 'The explicit fact or preference the student requested to remember.',
        },
      },
      required: ['request'],
    },
  },
  {
    name: 'read_calendar',
    kind: 'calendar.read',
    description: 'Reads local student calendar events and tasks within a date window.',
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
        query: {type: 'string', description: 'Search term (max 100 characters).'},
        limit: {type: 'number', description: 'Max number of results to return (1..50).'},
      },
      required: ['query'],
    },
  },
  {
    name: 'read_memories',
    kind: 'memory.read',
    description: 'Reads saved student memories and personal study preferences from local storage.',
    parameters: {
      type: 'object',
      properties: {
        query: {type: 'string', description: 'Optional search keyword to match memories.'},
      },
    },
  },
  {
    name: 'prepare_memory',
    kind: 'memory.prepare',
    description: 'Proposes saving an explicit student fact or preference. Prepares a card for user confirmation before saving.',
    parameters: {
      type: 'object',
      properties: {
        text: {type: 'string', description: 'The fact or preference to remember (1..200 chars).'},
      },
      required: ['text'],
    },
  },
  {
    name: 'revise_draft',
    kind: 'draft.revise',
    description: 'Modifies an existing in-progress draft card (e.g. changing date, time, title, or duration) before confirmation.',
    parameters: {
      type: 'object',
      properties: {
        cardId: {type: 'string', description: 'The stable card ID of the draft to revise.'},
        revision: {type: 'number', description: 'The current revision number of the draft.'},
        instruction: {type: 'string', description: 'The spoken instruction describing what to change.'},
      },
      required: ['cardId', 'revision', 'instruction'],
    },
  },
  {
    name: 'confirm_draft',
    kind: 'draft.confirm',
    description: 'Confirms and commits the pending draft card to the student database.',
    parameters: {
      type: 'object',
      properties: {
        cardId: {type: 'string', description: 'The stable card ID of the draft to confirm.'},
        revision: {type: 'number', description: 'The revision number being confirmed.'},
      },
      required: ['cardId', 'revision'],
    },
  },
  {
    name: 'cancel_draft',
    kind: 'draft.cancel',
    description: 'Cancels the pending draft card without modifying the student database.',
    parameters: {
      type: 'object',
      properties: {
        cardId: {type: 'string', description: 'The stable card ID of the draft to cancel.'},
        revision: {type: 'number', description: 'The current revision number of the draft.'},
      },
      required: ['cardId', 'revision'],
    },
  },
];

const TOOL_MAP = new Map<string, RegisteredToolDefinition>(
  REGISTERED_TOOLS.map(t => [t.name, t]),
);

export function getRegisteredTool(name: string): RegisteredToolDefinition | undefined {
  return TOOL_MAP.get(name);
}

export function isToolSupported(name: string): boolean {
  return TOOL_MAP.has(name);
}

export function listSupportedToolNames(): string[] {
  return REGISTERED_TOOLS.map(t => t.name);
}

