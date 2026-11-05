import { useEffect } from 'react';

export type ToolBackHandler = () => boolean;
export type RegisterToolBack = (handler: ToolBackHandler | null) => void;

export const useToolBack = (
  register: RegisterToolBack | undefined,
  handler: ToolBackHandler | null,
): void => {
  useEffect(() => {
    if (!register) return undefined;
    register(handler);
    return () => register(null);
  }, [register, handler]);
};
