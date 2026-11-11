import type {CallNavigationRequest} from '../../navigation/callNavigation';
export type FilterType = string;

export interface NotesScreenProps {
  userId: string;
  refreshTrigger: number;
  openRequest?: CallNavigationRequest;
  onOpenRequestHandled?: (requestId: string) => void;
  onRefresh: () => void;
}
