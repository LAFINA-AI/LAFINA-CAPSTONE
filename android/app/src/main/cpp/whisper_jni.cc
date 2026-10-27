#include <jni.h>
#include <android/asset_manager.h>
#include <android/asset_manager_jni.h>
#include <android/log.h>
#include <algorithm>
#include <string>
#include <thread>
#include "whisper.h"

namespace {
constexpr const char *kTag = "LafinaWhisper";
constexpr const char *kAcademicPrompt =
    "LAFINA academic voice assistant for USTP students. Add a task, create a time block, set a "
    "reminder, or create a note. Cancel, remove, delete, update, or rename a task, time block, "
    "or note. Create a time block from 9 AM to 12 noon. Create a task at 7:30 AM today. Remind "
    "me in 30 minutes to submit my capstone project. What is my schedule for today and tomorrow? "
    "Laboratory, lecture, midterm, finals, quiz, exam, assignment, homework, deadline, professor, "
    "syllabus, study, meeting, today, tomorrow, morning, afternoon, evening, tonight, noon, "
    "midnight, AM, and PM. Acknowledge, acknowledged, snooze, snooze for ten minutes, dismiss, "
    "got it, okay.";
constexpr const char *kCallCommandPrompt =
    "Acknowledge. Acknowledged. Snooze. Snoozed. Snooze for five minutes. Snooze for ten "
    "minutes. Dismiss. Got it. Okay.";

constexpr float kNoSpeechThreshold = 0.65f;
constexpr float kHardSegmentNoSpeechLimit = 0.85f;
constexpr float kAccentTolerantLogprobThreshold = -1.25f;
constexpr float kHallucinationEntropyThreshold = 2.40f;
constexpr int kCallCommandAudioContext = 128;
constexpr int kCallCommandMaxTokens = 12;

size_t assetRead(void *context, void *output, size_t size) {
  return static_cast<size_t>(AAsset_read(static_cast<AAsset *>(context), output, size));
}

bool assetEof(void *context) {
  return AAsset_getRemainingLength64(static_cast<AAsset *>(context)) <= 0;
}

void assetClose(void *context) {
  AAsset_close(static_cast<AAsset *>(context));
}

std::string trim(const std::string &value) {
  const auto first = value.find_first_not_of(" \n\r\t");
  if (first == std::string::npos) return "";
  const auto last = value.find_last_not_of(" \n\r\t");
  return value.substr(first, last - first + 1);
}

std::string escapeJson(const std::string &value) {
  std::string escaped;
  escaped.reserve(value.size());
  for (char c : value) {
    if (c == '"') {
      escaped += "\\\"";
    } else if (c == '\\') {
      escaped += "\\\\";
    } else if (c == '\b') {
      escaped += "\\b";
    } else if (c == '\f') {
      escaped += "\\f";
    } else if (c == '\n') {
      escaped += "\\n";
    } else if (c == '\r') {
      escaped += "\\r";
    } else if (c == '\t') {
      escaped += "\\t";
    } else if (static_cast<unsigned char>(c) >= 0x20) {
      escaped += c;
    }
  }
  return escaped;
}
}

extern "C" JNIEXPORT jlong JNICALL
Java_com_lafina_LafinaWhisperBridge_initContext(
    JNIEnv *env, jobject, jobject assetManager, jstring assetPath) {
  const char *path = env->GetStringUTFChars(assetPath, nullptr);
  AAssetManager *manager = AAssetManager_fromJava(env, assetManager);
  AAsset *asset = AAssetManager_open(manager, path, AASSET_MODE_STREAMING);
  env->ReleaseStringUTFChars(assetPath, path);
  if (asset == nullptr) {
    __android_log_print(ANDROID_LOG_ERROR, kTag, "Unable to open Whisper model asset");
    return 0;
  }
  whisper_model_loader loader{};
  loader.context = asset;
  loader.read = assetRead;
  loader.eof = assetEof;
  loader.close = assetClose;
  whisper_context_params contextParams = whisper_context_default_params();
  contextParams.use_gpu = false;
  whisper_context *context = whisper_init_with_params(&loader, contextParams);
  return reinterpret_cast<jlong>(context);
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_lafina_LafinaWhisperBridge_transcribe(
    JNIEnv *env,
    jobject,
    jlong contextPointer,
    jfloatArray samples,
    jint requestedThreads,
    jboolean commandMode) {
  auto *context = reinterpret_cast<whisper_context *>(contextPointer);
  if (context == nullptr) return env->NewStringUTF("");
  const jsize sampleCount = env->GetArrayLength(samples);
  if (sampleCount <= 0) return env->NewStringUTF("");
  jfloat *audio = env->GetFloatArrayElements(samples, nullptr);
  if (audio == nullptr) return env->NewStringUTF("");
  whisper_full_params params = whisper_full_default_params(WHISPER_SAMPLING_GREEDY);
  params.language = "en";
  params.translate = false;
  params.no_context = true;
  params.no_timestamps = true;
  params.single_segment = true;
  params.print_progress = false;
  params.print_realtime = false;
  params.print_timestamps = false;
  params.suppress_blank = true;
  params.suppress_nst = true;
  params.temperature = 0.0f;
  // Disable temperature fallback when best_of=1 so accented or noisy speech never falls back
  // to high-temperature random sampling (0.2..1.0) that hallucinates unrelated words.
  params.temperature_inc = 0.0f;
  params.entropy_thold = kHallucinationEntropyThreshold;
  params.logprob_thold = kAccentTolerantLogprobThreshold;
  params.no_speech_thold = kNoSpeechThreshold;
  const bool isCommandMode = commandMode == JNI_TRUE;
  params.max_tokens = isCommandMode ? kCallCommandMaxTokens : 96;
  params.audio_ctx = isCommandMode ? kCallCommandAudioContext : 0;
  params.initial_prompt = isCommandMode ? kCallCommandPrompt : kAcademicPrompt;
  params.greedy.best_of = 1;
  params.n_threads = std::clamp(static_cast<int>(requestedThreads), 1, 4);
  std::string transcript;
  __android_log_print(
      ANDROID_LOG_INFO,
      kTag,
      "Transcribing %d samples with %d threads (commandMode=%d, audioCtx=%d)",
      static_cast<int>(sampleCount),
      params.n_threads,
      isCommandMode ? 1 : 0,
      params.audio_ctx);
  const int result = whisper_full(context, params, audio, sampleCount);
  env->ReleaseFloatArrayElements(samples, audio, JNI_ABORT);
  if (result == 0) {
    const int segmentCount = whisper_full_n_segments(context);
    for (int index = 0; index < segmentCount; ++index) {
      const float noSpeechProb = whisper_full_get_segment_no_speech_prob(context, index);
      if (noSpeechProb > kHardSegmentNoSpeechLimit) {
        continue;
      }
      const std::string segment = trim(whisper_full_get_segment_text(context, index));
      if (segment.empty()) continue;
      if (!transcript.empty()) transcript += " ";
      transcript += segment;
    }
    __android_log_print(
        ANDROID_LOG_INFO,
        kTag,
        "Transcription completed with %d segments and %zu characters",
        segmentCount,
        transcript.size());
  } else {
    __android_log_print(ANDROID_LOG_ERROR, kTag, "whisper_full failed: %d", result);
  }
  transcript = trim(transcript);
  return env->NewStringUTF(transcript.c_str());
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_lafina_LafinaWhisperBridge_transcribeWithTimestamps(
    JNIEnv *env,
    jobject,
    jlong contextPointer,
    jfloatArray samples,
    jint requestedThreads) {
  auto *context = reinterpret_cast<whisper_context *>(contextPointer);
  if (context == nullptr) return env->NewStringUTF("[]");
  const jsize sampleCount = env->GetArrayLength(samples);
  if (sampleCount <= 0) return env->NewStringUTF("[]");
  jfloat *audio = env->GetFloatArrayElements(samples, nullptr);
  if (audio == nullptr) return env->NewStringUTF("[]");

  whisper_full_params params = whisper_full_default_params(WHISPER_SAMPLING_GREEDY);
  params.language = "en";
  params.translate = false;
  params.no_context = true;
  params.no_timestamps = false;
  params.single_segment = false;
  params.print_progress = false;
  params.print_realtime = false;
  params.print_timestamps = false;
  params.suppress_blank = true;
  params.suppress_nst = true;
  params.temperature = 0.0f;
  params.temperature_inc = 0.0f;
  params.entropy_thold = kHallucinationEntropyThreshold;
  params.logprob_thold = kAccentTolerantLogprobThreshold;
  params.no_speech_thold = kNoSpeechThreshold;
  params.max_tokens = 256;
  params.audio_ctx = 0;
  params.initial_prompt = kAcademicPrompt;
  params.greedy.best_of = 1;
  params.n_threads = std::clamp(static_cast<int>(requestedThreads), 1, 4);

  const int result = whisper_full(context, params, audio, sampleCount);
  env->ReleaseFloatArrayElements(samples, audio, JNI_ABORT);

  std::string json = "[";
  if (result == 0) {
    const int segmentCount = whisper_full_n_segments(context);
    bool first = true;
    for (int index = 0; index < segmentCount; ++index) {
      const float noSpeechProb = whisper_full_get_segment_no_speech_prob(context, index);
      if (noSpeechProb > kHardSegmentNoSpeechLimit) {
        continue;
      }
      const std::string segmentText = trim(whisper_full_get_segment_text(context, index));
      if (segmentText.empty()) continue;
      const int64_t t0 = static_cast<int64_t>(whisper_full_get_segment_t0(context, index)) * 10;
      const int64_t t1 = static_cast<int64_t>(whisper_full_get_segment_t1(context, index)) * 10;
      if (!first) json += ",";
      first = false;
      json += "{\"start_ms\":" + std::to_string(t0) + ",\"end_ms\":" + std::to_string(t1) +
              ",\"text\":\"" + escapeJson(segmentText) + "\"}";
    }
  } else {
    __android_log_print(ANDROID_LOG_ERROR, kTag, "whisper_full with timestamps failed: %d", result);
  }
  json += "]";
  return env->NewStringUTF(json.c_str());
}

extern "C" JNIEXPORT void JNICALL
Java_com_lafina_LafinaWhisperBridge_freeContext(JNIEnv *, jobject, jlong contextPointer) {
  auto *context = reinterpret_cast<whisper_context *>(contextPointer);
  if (context != nullptr) whisper_free(context);
}

extern "C" JNIEXPORT jlong JNICALL
Java_com_lafina_capstone_LafinaWhisperBridge_initContext(
    JNIEnv *env, jobject thiz, jobject assetManager, jstring assetPath) {
  return Java_com_lafina_LafinaWhisperBridge_initContext(env, thiz, assetManager, assetPath);
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_lafina_capstone_LafinaWhisperBridge_transcribe(
    JNIEnv *env,
    jobject thiz,
    jlong contextPointer,
    jfloatArray samples,
    jint requestedThreads,
    jboolean commandMode) {
  return Java_com_lafina_LafinaWhisperBridge_transcribe(
      env, thiz, contextPointer, samples, requestedThreads, commandMode);
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_lafina_capstone_LafinaWhisperBridge_transcribeWithTimestamps(
    JNIEnv *env,
    jobject thiz,
    jlong contextPointer,
    jfloatArray samples,
    jint requestedThreads) {
  return Java_com_lafina_LafinaWhisperBridge_transcribeWithTimestamps(
      env, thiz, contextPointer, samples, requestedThreads);
}

extern "C" JNIEXPORT void JNICALL
Java_com_lafina_capstone_LafinaWhisperBridge_freeContext(
    JNIEnv *env, jobject thiz, jlong contextPointer) {
  Java_com_lafina_LafinaWhisperBridge_freeContext(env, thiz, contextPointer);
}
