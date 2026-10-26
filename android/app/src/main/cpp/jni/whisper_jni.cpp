#include <jni.h>
#include <algorithm>
#include <atomic>
#include <chrono>
#include <cmath>
#include <exception>
#include <memory>
#include <mutex>
#include <string>
#include <vector>
#include "whisper.h"

namespace {
constexpr jsize kMaxSamples = 16000 * 15;
constexpr size_t kMaxUtf8 = 8000;
// One inference per process; a separate Kotlin file lock covers both app processes.
std::mutex inference_mutex;
std::once_flag logging_once;
void quiet_log(ggml_log_level, const char *, void *) {}
struct GlobalReference {
  JNIEnv *env;
  jobject value;
  ~GlobalReference() { if (value != nullptr) env->DeleteGlobalRef(value); }
};
struct AudioBuffer {
  std::vector<float> values;
  explicit AudioBuffer(size_t size) : values(size) {}
  ~AudioBuffer() {
    // Best-effort clearing on every return/exception, not a forensic guarantee.
    volatile float *data = values.data();
    for (size_t i = 0; i < values.size(); ++i) data[i] = 0.0f;
  }
};

void fail(JNIEnv *env, const char *reason) {
  if (!env->ExceptionCheck()) {
    jclass type = env->FindClass("java/lang/IllegalStateException");
    if (type != nullptr) env->ThrowNew(type, reason);
  }
}

struct Cancellation {
  JavaVM *vm;
  jobject callback;
  jmethodID method;
  std::atomic_bool stopped{false};
  std::chrono::steady_clock::time_point deadline;

  bool check() {
    if (stopped.load() || std::chrono::steady_clock::now() >= deadline) {
      stopped.store(true); return true;
    }
    // GGML may poll from a worker thread. Never reuse the caller's JNIEnv there.
    JNIEnv *env = nullptr;
    const auto result = vm->GetEnv(reinterpret_cast<void **>(&env), JNI_VERSION_1_6);
    bool attached = false;
    if (result == JNI_EDETACHED) {
      if (vm->AttachCurrentThread(&env, nullptr) != JNI_OK) {
        stopped.store(true); return true;
      }
      attached = true;
    } else if (result != JNI_OK) {
      stopped.store(true); return true;
    }
    const bool cancelled = env->CallBooleanMethod(callback, method) == JNI_TRUE;
    const bool error = env->ExceptionCheck();
    if (error) env->ExceptionClear();
    if (attached) vm->DetachCurrentThread();
    if (cancelled || error) stopped.store(true);
    return stopped.load();
  }
};
bool should_abort(void *value) { return static_cast<Cancellation *>(value)->check(); }

jstring utf8_result(JNIEnv *env, const std::string &value) {
  // NewStringUTF accepts modified UTF-8; Java's explicit decoder also handles
  // supplementary characters/invalid engine bytes without corrupt JNI strings.
  jbyteArray bytes = env->NewByteArray(static_cast<jsize>(value.size()));
  if (bytes == nullptr) return nullptr;
  env->SetByteArrayRegion(bytes, 0, static_cast<jsize>(value.size()),
                          reinterpret_cast<const jbyte *>(value.data()));
  jclass type = env->FindClass("java/lang/String");
  jmethodID constructor = type == nullptr ? nullptr : env->GetMethodID(type, "<init>", "([BLjava/lang/String;)V");
  jstring encoding = env->NewStringUTF("UTF-8");
  auto result = constructor == nullptr || encoding == nullptr ? nullptr :
      static_cast<jstring>(env->NewObject(type, constructor, bytes, encoding));
  env->DeleteLocalRef(bytes);
  if (encoding != nullptr) env->DeleteLocalRef(encoding);
  return result;
}
} // namespace

extern "C" JNIEXPORT jstring JNICALL
Java_com_lafina_capstone_voice_WhisperTranscriber_transcribeNative(
    JNIEnv *env, jobject, jstring model_path, jfloatArray input, jstring language,
    jobject cancellation) {
  try {
  std::unique_lock<std::mutex> ownership(inference_mutex, std::try_to_lock);
  if (!ownership.owns_lock()) { fail(env, "WHISPER_BUSY"); return nullptr; }
  if (model_path == nullptr || input == nullptr || language == nullptr || cancellation == nullptr) {
    fail(env, "WHISPER_INVALID_INPUT"); return nullptr;
  }
  const jsize count = env->GetArrayLength(input);
  if (count < 1600 || count > kMaxSamples) { fail(env, "WHISPER_INVALID_INPUT"); return nullptr; }
  AudioBuffer private_audio(static_cast<size_t>(count));
  auto &audio = private_audio.values;
  env->GetFloatArrayRegion(input, 0, count, audio.data());
  if (env->ExceptionCheck()) return nullptr;
  for (const float value : audio) {
    if (!std::isfinite(value) || std::abs(value) > 1.0f) {
      fail(env, "WHISPER_INVALID_INPUT"); return nullptr;
    }
  }
  const char *path_bytes = env->GetStringUTFChars(model_path, nullptr);
  if (path_bytes == nullptr) return nullptr;
  const std::string path(path_bytes);
  env->ReleaseStringUTFChars(model_path, path_bytes);
  const char *lang_bytes = env->GetStringUTFChars(language, nullptr);
  if (lang_bytes == nullptr) return nullptr;
  const std::string lang(lang_bytes);
  env->ReleaseStringUTFChars(language, lang_bytes);
  if (lang != "en" && lang != "tl") { fail(env, "WHISPER_LANGUAGE_UNAVAILABLE"); return nullptr; }

  JavaVM *vm = nullptr;
  env->GetJavaVM(&vm);
  jclass callback_type = env->GetObjectClass(cancellation);
  jmethodID callback_method = env->GetMethodID(callback_type, "isCancelled", "()Z");
  jobject callback_global = env->NewGlobalRef(cancellation);
  GlobalReference reference{env, callback_global};
  if (vm == nullptr || callback_method == nullptr || callback_global == nullptr) return nullptr;
  Cancellation state{vm, callback_global, callback_method, false,
      std::chrono::steady_clock::now() + std::chrono::seconds(30)};
  std::call_once(logging_once, [] { whisper_log_set(quiet_log, nullptr); });
  std::string transcript;
  {
    // Context ownership never crosses JNI calls; cancellation cannot free a context
    // while inference owns it. Model and decoder memory are released on every exit.
    auto options = whisper_context_default_params();
    options.use_gpu = false;
    std::unique_ptr<whisper_context, decltype(&whisper_free)> context(nullptr, whisper_free);
    if (!state.check()) context.reset(whisper_init_from_file_with_params(path.c_str(), options));
    if (context == nullptr && !state.stopped.load()) fail(env, "WHISPER_MODEL_LOAD_FAILED");
    if (context != nullptr && !state.check()) {
      auto params = whisper_full_default_params(WHISPER_SAMPLING_GREEDY);
      params.n_threads = 2;
      params.language = lang.c_str();
      params.translate = false;
      params.detect_language = false;
      params.no_context = true;
      params.no_timestamps = true;
      params.single_segment = true;
      params.print_special = false;
      params.print_progress = false;
      params.print_realtime = false;
      params.print_timestamps = false;
      params.suppress_blank = true;
      params.suppress_nst = true;
      params.temperature = 0.0f;
      params.temperature_inc = 0.0f;
      params.greedy.best_of = 1;
      params.max_tokens = 128;
      params.initial_prompt = nullptr;
      params.abort_callback = should_abort;
      params.abort_callback_user_data = &state;
      // Keep the upstream no-speech threshold, unlike legacy's disabled gate.
      const int result = whisper_full(context.get(), params, audio.data(), count);
      if (!state.check()) {
        if (result != 0) fail(env, "WHISPER_INFERENCE_FAILED");
        else for (int i = 0; i < whisper_full_n_segments(context.get()); ++i) {
          const char *segment = whisper_full_get_segment_text(context.get(), i);
          if (segment == nullptr) continue;
          if (!transcript.empty()) transcript += " ";
          transcript += segment;
          if (transcript.size() > kMaxUtf8) { fail(env, "WHISPER_OUTPUT_LIMIT"); break; }
        }
      }
    }
  }
  std::fill(audio.begin(), audio.end(), 0.0f);
  if (state.stopped.load()) { fail(env, "WHISPER_CANCELLED_OR_TIMEOUT"); return nullptr; }
  if (env->ExceptionCheck()) return nullptr;
  return utf8_result(env, transcript);
  } catch (const std::exception &) {
    fail(env, "WHISPER_NATIVE_FAILED"); return nullptr;
  } catch (...) {
    fail(env, "WHISPER_NATIVE_FAILED"); return nullptr;
  }
}
