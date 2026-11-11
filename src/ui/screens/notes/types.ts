import type {CallNavigationRequest} from '../../navigation/callNavigation';
export type FilterType = string;
export type NotesSubTab = 'notes' | 'todo';
export type TodoFilterType =
  | 'open'
  | 'undated'
  | 'scheduled'
  | 'checklists'
  | 'completed';

export interface NotesScreenProps {
  userId: string;
  refreshTrigger: number;
  openRequest?: CallNavigationRequest;
  onOpenRequestHandled?: (requestId: string) => void;
  onRefresh: () => void;
}
