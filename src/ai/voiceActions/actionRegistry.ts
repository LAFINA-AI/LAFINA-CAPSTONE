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

