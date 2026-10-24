/**
 * Generate a unique ID with an optional prefix.
 *
 * @param prefix - Optional string prefix (e.g. 'task', 'note', 'block')
 * @returns A unique string ID like "task_abc123def"
 */
export const generateId = (prefix?: string): string => {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 11);
  const id = `${timestamp}${randomPart}`;
  return prefix ? `${prefix}_${id}` : id;
};
