import fs from 'node:fs';
import path from 'node:path';

const ttsGradlePath = path.resolve(
  'node_modules/react-native-tts/android/build.gradle',
);

if (fs.existsSync(ttsGradlePath)) {
  const original = fs.readFileSync(ttsGradlePath, 'utf8');
  const patched = original.replace(/\bjcenter\(\)/g, 'mavenCentral()');
  if (patched !== original) {
    fs.writeFileSync(ttsGradlePath, patched, 'utf8');
    console.log('[patch-android-libs] Patched react-native-tts android/build.gradle (jcenter -> mavenCentral)');
  }
}
