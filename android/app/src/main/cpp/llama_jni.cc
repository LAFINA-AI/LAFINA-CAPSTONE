#include <jni.h>
#include <android/log.h>

#include <algorithm>
#include <atomic>
#include <cstdint>
#include <limits>
#include <mutex>
#include <string>
#include <vector>

#include "llama.h"

namespace {
constexpr const char *kTag = "LafinaLlama";

std::once_flag gBackendInitOnce;

void llamaAndroidLogCallback(ggml_log_level level, const char *text, void *) {
  if (text == nullptr) return;
  int priority = ANDROID_LOG_DEBUG;
  switch (level) {
    case GGML_LOG_LEVEL_ERROR:
      priority = ANDROID_LOG_ERROR;
      break;
    case GGML_LOG_LEVEL_WARN:
      priority = ANDROID_LOG_WARN;
      break;
    case GGML_LOG_LEVEL_INFO:
    case GGML_LOG_LEVEL_DEBUG:
    case GGML_LOG_LEVEL_CONT:
    case GGML_LOG_LEVEL_NONE:
    default:
      return;
  }
  __android_log_print(priority, kTag, "%s", text);
}

void ensureBackendInitialized() {
  std::call_once(gBackendInitOnce, []() {
    llama_log_set(llamaAndroidLogCallback, nullptr);
    llama_backend_init();
  });
}

struct LafinaLlamaContext {
  llama_model *model = nullptr;
  llama_context *ctx = nullptr;
  int32_t n_threads = 2;
  std::mutex mutex;
  // Tokens whose keys/values are in the context now. Every request starts
  // with the same instructions, so only the part after the shared prefix
  // (the student's words) is read again.
  std::vector<llama_token> cached;
  // Set by the app when the answer is no longer wanted (the student moved on or
  // the wait limit passed). Checked between tokens and inside llama_decode.
  std::atomic<bool> cancel{false};
};

bool generationCancelled(void *data) {
  return static_cast<LafinaLlamaContext *>(data)->cancel.load(std::memory_order_relaxed);
}

struct JsonTrackState {
  bool seenOpenBrace = false;
  bool inString = false;
  bool escaped = false;
  int braceDepth = 0;

  // Advances state across appended bytes and returns true once a top-level
  // JSON object closes.
  bool feed(const std::string &chunk) {
    for (char c : chunk) {
      if (!seenOpenBrace) {
        if (c == '{') {
          seenOpenBrace = true;
          braceDepth = 1;
        }
        continue;
      }

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (c == '\\') {
          escaped = true;
        } else if (c == '"') {
          inString = false;
        }
        continue;
      }

      if (c == '"') {
        inString = true;
      } else if (c == '{') {
        ++braceDepth;
      } else if (c == '}') {
        --braceDepth;
        if (braceDepth <= 0) {
          return true;
        }
      }
    }
    return false;
  }
};

std::string tokenToPiece(const llama_vocab *vocab, llama_token token) {
  char stackBuf[256];
  int32_t n = llama_token_to_piece(vocab, token, stackBuf, sizeof(stackBuf), 0, true);
  if (n >= 0) {
    return std::string(stackBuf, static_cast<size_t>(n));
  }
  const int32_t needed = -n;
  std::string heapBuf(static_cast<size_t>(needed), '\0');
  const int32_t written = llama_token_to_piece(vocab, token, heapBuf.data(), needed, 0, true);
  if (written > 0) {
    heapBuf.resize(static_cast<size_t>(written));
    return heapBuf;
  }
  return "";
}

bool trimAtStopTag(std::string &output) {
  static constexpr const char *kStopTags[] = {
      "<|im_end|>",
      "<end_of_turn>",
      "<|endoftext|>",
  };
  for (const char *tag : kStopTags) {
    const size_t pos = output.find(tag);
    if (pos != std::string::npos) {
      output.erase(pos);
      return true;
    }
  }
  return false;
}

// Decodes UTF-8 into UTF-16 so 4-byte scalar values (e.g. emojis) and truncated trailing
// multi-byte sequences never trigger Android ART's NewStringUTF Modified-UTF-8 abort.
jstring utf8ToJString(JNIEnv *env, const std::string &utf8) {
  std::u16string u16;
  u16.reserve(utf8.size());
  const size_t len = utf8.size();
  size_t i = 0;
  while (i < len) {
    const unsigned char c0 = static_cast<unsigned char>(utf8[i]);
    if (c0 < 0x80) {
      u16.push_back(static_cast<char16_t>(c0));
      ++i;
      continue;
    }
    uint32_t cp = 0;
    size_t seqLen = 0;
    uint32_t minCp = 0;
    if ((c0 & 0xE0) == 0xC0) {
      cp = c0 & 0x1F;
      seqLen = 2;
      minCp = 0x80;
    } else if ((c0 & 0xF0) == 0xE0) {
      cp = c0 & 0x0F;
      seqLen = 3;
      minCp = 0x800;
    } else if ((c0 & 0xF8) == 0xF0) {
      cp = c0 & 0x07;
      seqLen = 4;
      minCp = 0x10000;
    } else {
      u16.push_back(0xFFFD);
      ++i;
      continue;
    }
    if (i + seqLen > len) {
      // Truncated trailing UTF-8 sequence when tokenBudget stops mid-character.
      break;
    }
    bool valid = true;
    for (size_t j = 1; j < seqLen; ++j) {
      const unsigned char cx = static_cast<unsigned char>(utf8[i + j]);
      if ((cx & 0xC0) != 0x80) {
        valid = false;
        break;
      }
      cp = (cp << 6) | (cx & 0x3F);
    }
    if (!valid || cp < minCp || cp > 0x10FFFF || (cp >= 0xD800 && cp <= 0xDFFF)) {
      u16.push_back(0xFFFD);
      ++i;
      continue;
    }
    if (cp <= 0xFFFF) {
      u16.push_back(static_cast<char16_t>(cp));
    } else {
      cp -= 0x10000;
      u16.push_back(static_cast<char16_t>(0xD800 + (cp >> 10)));
      u16.push_back(static_cast<char16_t>(0xDC00 + (cp & 0x3FF)));
    }
    i += seqLen;
  }
  return env->NewString(reinterpret_cast<const jchar *>(u16.data()), static_cast<jsize>(u16.size()));
}
}  // namespace

extern "C" JNIEXPORT jlong JNICALL
Java_com_lafina_capstone_LafinaLlamaBridge_initModel(
    JNIEnv *env, jobject, jstring modelPath, jint nThreads) {
  if (modelPath == nullptr) {
    return 0;
  }

  const char *rawPath = env->GetStringUTFChars(modelPath, nullptr);
  if (rawPath == nullptr) {
    return 0;
  }
  std::string pathStr(rawPath);
  env->ReleaseStringUTFChars(modelPath, rawPath);
  if (pathStr.empty()) {
    return 0;
  }

  ensureBackendInitialized();

  llama_model_params mparams = llama_model_default_params();
  mparams.n_gpu_layers = 0;
  mparams.load_mode = LLAMA_LOAD_MODE_MMAP;

  llama_model *model = llama_model_load_from_file(pathStr.c_str(), mparams);
  if (model == nullptr) {
    __android_log_print(ANDROID_LOG_ERROR, kTag, "Failed to load GGUF model: %s", pathStr.c_str());
    return 0;
  }

  const int32_t clampedThreads = std::clamp(static_cast<int32_t>(nThreads), 1, 4);
  llama_context_params cparams = llama_context_default_params();
  cparams.n_ctx = 1024;
  cparams.n_batch = 512;
  cparams.n_ubatch = 512;
  cparams.n_threads = clampedThreads;
  cparams.n_threads_batch = clampedThreads;
  cparams.offload_kqv = false;
  cparams.op_offload = false;
  cparams.no_perf = true;

  llama_context *ctx = llama_init_from_model(model, cparams);
  if (ctx == nullptr) {
    __android_log_print(ANDROID_LOG_ERROR, kTag, "Failed to create llama_context for model");
    llama_model_free(model);
    return 0;
  }

  auto *handle = new LafinaLlamaContext();
  handle->model = model;
  handle->ctx = ctx;
  handle->n_threads = clampedThreads;
  llama_set_abort_callback(ctx, generationCancelled, handle);

  __android_log_print(
      ANDROID_LOG_INFO,
      kTag,
      "Loaded GGUF model with %d threads (n_ctx=%u)",
      clampedThreads,
      llama_n_ctx(ctx));

  return reinterpret_cast<jlong>(handle);
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_lafina_capstone_LafinaLlamaBridge_generate(
    JNIEnv *env, jobject, jlong contextPointer, jstring prompt, jint maxTokens) {
  auto *handle = reinterpret_cast<LafinaLlamaContext *>(contextPointer);
  if (handle == nullptr || prompt == nullptr) {
    return env->NewStringUTF("");
  }

  const char *rawPrompt = env->GetStringUTFChars(prompt, nullptr);
  if (rawPrompt == nullptr) {
    return env->NewStringUTF("");
  }
  std::string promptStr(rawPrompt);
  env->ReleaseStringUTFChars(prompt, rawPrompt);
  if (promptStr.empty()) {
    return env->NewStringUTF("");
  }

  std::lock_guard<std::mutex> lock(handle->mutex);
  if (handle->model == nullptr || handle->ctx == nullptr) {
    return env->NewStringUTF("");
  }
  llama_memory_t memory = llama_get_memory(handle->ctx);

  const llama_vocab *vocab = llama_model_get_vocab(handle->model);
  if (vocab == nullptr) {
    return env->NewStringUTF("");
  }

  // Avoid double-BOS on Gemma prompts that already begin with "<bos>".
  const bool hasExplicitBos =
      promptStr.rfind("<bos>", 0) == 0 ||
      promptStr.rfind("<s>", 0) == 0 ||
      promptStr.rfind("<|begin_of_text|>", 0) == 0;
  const bool addSpecial = !hasExplicitBos && llama_vocab_get_add_bos(vocab);

  const int32_t rawNeeded = llama_tokenize(
      vocab,
      promptStr.c_str(),
      static_cast<int32_t>(promptStr.size()),
      nullptr,
      0,
      addSpecial,
      true);
  if (rawNeeded >= 0 || rawNeeded == std::numeric_limits<int32_t>::min()) {
    __android_log_print(ANDROID_LOG_ERROR, kTag, "Failed to size prompt tokens (%d)", rawNeeded);
    return env->NewStringUTF("");
  }
  const int32_t needed = -rawNeeded;

  std::vector<llama_token> promptTokens(static_cast<size_t>(needed));
  const int32_t tokenized = llama_tokenize(
      vocab,
      promptStr.c_str(),
      static_cast<int32_t>(promptStr.size()),
      promptTokens.data(),
      static_cast<int32_t>(promptTokens.size()),
      addSpecial,
      true);
  if (tokenized <= 0) {
    __android_log_print(ANDROID_LOG_ERROR, kTag, "Failed to tokenize prompt (%d)", tokenized);
    return env->NewStringUTF("");
  }
  promptTokens.resize(static_cast<size_t>(tokenized));

  const uint32_t nCtx = llama_n_ctx(handle->ctx);
  if (promptTokens.size() >= nCtx) {
    __android_log_print(
        ANDROID_LOG_ERROR,
        kTag,
        "Prompt exceeds context window (%zu >= %u)",
        promptTokens.size(),
        nCtx);
    return env->NewStringUTF("");
  }

  // Keep the shared prefix; at least the last prompt token is read again so
  // there are fresh logits to sample from.
  size_t reuse = 0;
  const size_t reusable = std::min(handle->cached.size(), promptTokens.size() - 1);
  while (reuse < reusable && handle->cached[reuse] == promptTokens[reuse]) {
    ++reuse;
  }
  if (reuse == 0 || !llama_memory_seq_rm(memory, 0, static_cast<llama_pos>(reuse), -1)) {
    llama_memory_clear(memory, true);
    reuse = 0;
  }
  handle->cached.assign(promptTokens.begin(), promptTokens.begin() + reuse);
  __android_log_print(
      ANDROID_LOG_INFO,
      kTag,
      "Prompt %zu tokens, %zu reused from the last request",
      promptTokens.size(),
      reuse);

  const uint32_t nBatch = std::max<uint32_t>(1, llama_n_batch(handle->ctx));
  for (size_t offset = reuse; offset < promptTokens.size(); offset += nBatch) {
    if (handle->cancel.load(std::memory_order_relaxed)) {
      __android_log_print(ANDROID_LOG_INFO, kTag, "Generation cancelled while reading the prompt");
      return env->NewStringUTF("");
    }
    const int32_t chunkSize = static_cast<int32_t>(
        std::min<size_t>(nBatch, promptTokens.size() - offset));
    llama_batch batch = llama_batch_get_one(promptTokens.data() + offset, chunkSize);
    if (llama_decode(handle->ctx, batch) != 0) {
      __android_log_print(ANDROID_LOG_ERROR, kTag, "llama_decode failed on prompt chunk");
      llama_memory_clear(memory, true);
      handle->cached.clear();
      return env->NewStringUTF("");
    }
    handle->cached.insert(
        handle->cached.end(),
        promptTokens.begin() + offset,
        promptTokens.begin() + offset + chunkSize);
  }

  auto sparams = llama_sampler_chain_default_params();
  sparams.no_perf = true;
  llama_sampler *sampler = llama_sampler_chain_init(sparams);
  if (sampler == nullptr) {
    return env->NewStringUTF("");
  }
  llama_sampler_chain_add(sampler, llama_sampler_init_greedy());

  const int32_t clampedMaxTokens = std::clamp(static_cast<int32_t>(maxTokens), 1, 256);
  const int32_t remainingCtx = static_cast<int32_t>(nCtx - promptTokens.size());
  const int32_t tokenBudget = std::min(clampedMaxTokens, remainingCtx);

  std::string output;
  output.reserve(256);
  JsonTrackState jsonState;

  for (int32_t i = 0; i < tokenBudget; ++i) {
    if (handle->cancel.load(std::memory_order_relaxed)) {
      __android_log_print(ANDROID_LOG_INFO, kTag, "Generation cancelled after %d tokens", i);
      output.clear();
      break;
    }
    llama_token tokenId = llama_sampler_sample(sampler, handle->ctx, -1);
    if (llama_vocab_is_eog(vocab, tokenId)) {
      break;
    }

    const std::string piece = tokenToPiece(vocab, tokenId);
    if (!piece.empty()) {
      output += piece;
      if (trimAtStopTag(output)) {
        break;
      }
      if (jsonState.feed(piece)) {
        break;
      }
    }

    if (i + 1 < tokenBudget) {
      llama_batch nextBatch = llama_batch_get_one(&tokenId, 1);
      if (llama_decode(handle->ctx, nextBatch) != 0) {
        __android_log_print(ANDROID_LOG_ERROR, kTag, "llama_decode failed during generation");
        llama_memory_clear(memory, true);
        handle->cached.clear();
        output.clear();
        break;
      }
      handle->cached.push_back(tokenId);
    }
  }

  llama_sampler_free(sampler);
  return utf8ToJString(env, output);
}

extern "C" JNIEXPORT void JNICALL
Java_com_lafina_capstone_LafinaLlamaBridge_setCancel(
    JNIEnv *, jobject, jlong contextPointer, jboolean cancel) {
  auto *handle = reinterpret_cast<LafinaLlamaContext *>(contextPointer);
  if (handle == nullptr) return;
  // Lock-free on purpose: it must reach a generate() that holds the mutex.
  handle->cancel.store(cancel == JNI_TRUE, std::memory_order_relaxed);
}

extern "C" JNIEXPORT void JNICALL
Java_com_lafina_capstone_LafinaLlamaBridge_freeModel(
    JNIEnv *, jobject, jlong contextPointer) {
  auto *handle = reinterpret_cast<LafinaLlamaContext *>(contextPointer);
  if (handle == nullptr) {
    return;
  }
  // Signal cancellation lock-free first so any in-flight generate() exits promptly.
  handle->cancel.store(true, std::memory_order_relaxed);
  llama_context *ctxToFree = nullptr;
  llama_model *modelToFree = nullptr;
  {
    std::lock_guard<std::mutex> lock(handle->mutex);
    ctxToFree = handle->ctx;
    modelToFree = handle->model;
    handle->ctx = nullptr;
    handle->model = nullptr;
    handle->cached.clear();
  }
  if (ctxToFree != nullptr) {
    llama_free(ctxToFree);
  }
  if (modelToFree != nullptr) {
    llama_model_free(modelToFree);
  }
  delete handle;
}

extern "C" JNIEXPORT jlong JNICALL
Java_com_lafina_LafinaLlamaBridge_initModel(
    JNIEnv *env, jobject thiz, jstring modelPath, jint nThreads) {
  return Java_com_lafina_capstone_LafinaLlamaBridge_initModel(env, thiz, modelPath, nThreads);
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_lafina_LafinaLlamaBridge_generate(
    JNIEnv *env, jobject thiz, jlong contextPointer, jstring prompt, jint maxTokens) {
  return Java_com_lafina_capstone_LafinaLlamaBridge_generate(
      env, thiz, contextPointer, prompt, maxTokens);
}

extern "C" JNIEXPORT void JNICALL
Java_com_lafina_LafinaLlamaBridge_setCancel(
    JNIEnv *env, jobject thiz, jlong contextPointer, jboolean cancel) {
  Java_com_lafina_capstone_LafinaLlamaBridge_setCancel(env, thiz, contextPointer, cancel);
}

extern "C" JNIEXPORT void JNICALL
Java_com_lafina_LafinaLlamaBridge_freeModel(
    JNIEnv *env, jobject thiz, jlong contextPointer) {
  Java_com_lafina_capstone_LafinaLlamaBridge_freeModel(env, thiz, contextPointer);
}
