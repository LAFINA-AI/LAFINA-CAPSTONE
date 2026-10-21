# 13 — Technical References (Reverify at implementation)

All links are reference starting points, not blanket guarantee that an API works on every device, that policies permit all use cases, or that pricing is unchanged. Agent should verify during its phase. Do not use cloud technologies in offline core due to presence in this list.

## Core and Android

- Android `TextToSpeech`: https://developer.android.com/reference/android/speech/tts/TextToSpeech
- Android `Voice` (offline voice capability flag): https://developer.android.com/reference/android/speech/tts/Voice
- Android `SpeechRecognizer`: https://developer.android.com/reference/android/speech/SpeechRecognizer
- Android background/alarms guidance: https://developer.android.com/develop/background-work/services/alarms
- Android full-screen intent / Android 14 restrictions: https://developer.android.com/about/versions/14/behavior-changes-14
- Play policies on FSI foreground service declarations: https://support.google.com/googleplay/android-developer/answer/13392821
- Android Macrobenchmark: https://developer.android.com/topic/performance/benchmarking/macrobenchmark-overview
- React Native setup: https://reactnative.dev/docs/environment-setup
- Whisper.cpp: https://github.com/ggml-org/whisper.cpp
- Sherpa-ONNX (alternative for later benchmarking): https://github.com/k2-fsa/sherpa-onnx

## Online (Phases 09/10 only)

- Google Gemini API docs: https://ai.google.dev/gemini-api/docs
- Gemini API pricing and quotas (always check for current rates): https://ai.google.dev/gemini-api/docs/pricing
- Gemini structured outputs: https://ai.google.dev/gemini-api/docs/structured-output
- USTP official issuances: https://www.ustp.edu.ph/issuances/
- Pinecone index / SDK docs: https://docs.pinecone.io/

## Legacy GitHub pinned source

- Main: https://github.com/LAFINA-AI/LAFINA/tree/f7e70aec54e6d16e627f444f2a67114cbfb07b5e
- Main native alarm bridge: https://github.com/LAFINA-AI/LAFINA/blob/f7e70aec54e6d16e627f444f2a67114cbfb07b5e/android/app/src/main/java/com/lafina/LafinaReminderModule.kt
- Voice pipeline: https://github.com/LAFINA-AI/LAFINA/blob/f7e70aec54e6d16e627f444f2a67114cbfb07b5e/src/ai/native/voicePipeline.ts
- RAG: https://github.com/LAFINA-AI/LAFINA/blob/f7e70aec54e6d16e627f444f2a67114cbfb07b5e/backend/app/services/handbook_rag.py
- New work repo: https://github.com/LAFINA-AI/LAFINA-CAPSTONE
