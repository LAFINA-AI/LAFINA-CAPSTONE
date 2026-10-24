import { version } from '../package.json';

/**
 * The app's version, taken from `package.json` rather than written out again
 * here — the desktop app reads the same field through `app.getVersion()`, and
 * a number typed into a screen only ever drifts from the one that shipped.
 */
export const APP_VERSION: string = version;
