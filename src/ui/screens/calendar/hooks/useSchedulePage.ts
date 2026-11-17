import {useCallback, useState} from 'react';

export const SCHEDULE_PAGE_SIZE = 20;

/** Bound list rendering inside Calendar's parent ScrollView. Data stays complete. */
export function useSchedulePage<T>(day: string, items: readonly T[]) {
  const [page, setPage] = useState({day, limit: SCHEDULE_PAGE_SIZE});
  const limit = page.day === day ? page.limit : SCHEDULE_PAGE_SIZE;
  if (page.day !== day) setPage({day, limit: SCHEDULE_PAGE_SIZE});
  const showMore = useCallback(() => {
    setPage(previous => ({
      day,
      limit:
        (previous.day === day ? previous.limit : SCHEDULE_PAGE_SIZE) +
        SCHEDULE_PAGE_SIZE,
    }));
  }, [day]);
  return {
    items: items.slice(0, limit),
    remaining: Math.max(0, items.length - limit),
    showMore,
  };
}
