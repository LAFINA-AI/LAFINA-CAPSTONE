/**
 * The `local_settings` owner id for device-wide defaults that are not tied
 * to an account (theme, UI variant, offline model selection).
 *
 * `src/cloud/backendSelection.ts` keeps its older `'__device__'` owner on
 * purpose: changing it would silently reset every install's backend choice.
 */
export const DEVICE_SETTINGS_SCOPE = '__device_default__';
