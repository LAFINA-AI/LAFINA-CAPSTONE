/**
 * @format
 */

import { AppRegistry } from 'react-native';
import App from './App';
import QuickChatRoot from './src/ui/quickChat/QuickChatRoot';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
// Floating LAFINA (ADR-036): the Quick Chat panel's root (QuickChatActivity).
AppRegistry.registerComponent('LafinaQuickChat', () => QuickChatRoot);
