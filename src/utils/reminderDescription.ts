/** Scheduling metadata is durable/synced, but is not part of the student's note. */
export const reminderDescriptionText = (description?: string | null): string =>
  (description ?? '').replace(/\[RRULE(?:-START)?:[^\]]*\]/gi, '').trim();
