export type FilterType = string;

export interface NotesScreenProps {
  userId: string;
  refreshTrigger: number;
  onRefresh: () => void;
}
