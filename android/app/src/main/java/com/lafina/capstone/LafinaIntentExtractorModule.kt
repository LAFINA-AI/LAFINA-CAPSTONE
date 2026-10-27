package com.lafina.capstone

import android.os.Handler
import android.os.Looper
import android.util.Log
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import org.json.JSONObject
import java.io.File
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicLong

object LafinaLlamaBridge {
  private var isLibraryLoaded = false

  init {
    try {
      System.loadLibrary("lafina_llama")
      isLibraryLoaded = true
    } catch (e: UnsatisfiedLinkError) {
      Log.i("LafinaLlama", "Native library lafina_llama not bundled; using fast-path NLU engine.")
      isLibraryLoaded = false
    }
  }

  fun isLoaded(): Boolean = isLibraryLoaded

  external fun initModel(modelPath: String, nThreads: Int): Long
  external fun generate(contextPointer: Long, prompt: String, maxTokens: Int): String
  external fun freeModel(contextPointer: Long)
}

/**
 * Android Native Module for On-Device NLU and Intent Extraction.
 * Supports dynamic GGUF models (e.g. Qwen2.5-0.5B-Instruct) with 60-second idle auto-unload
 * and deterministic fast-path fallback.
 */
class LafinaIntentExtractorModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  companion object {
    private const val TAG = "LafinaIntentExtractor"
    private const val IDLE_UNLOAD_TIMEOUT_MS = 60_000L
  }

  override fun getName(): String = "LafinaIntentExtractor"

  private val executor = Executors.newSingleThreadExecutor()
  private val mainHandler = Handler(Looper.getMainLooper())
  private val nativeContextPointer = AtomicLong(0L)
  private var loadedModelPath: String? = null

  private val autoUnloadRunnable = Runnable {
    executor.execute {
      unloadNativeModelInternal()
    }
  }

  private fun scheduleAutoUnload() {
    mainHandler.removeCallbacks(autoUnloadRunnable)
    mainHandler.postDelayed(autoUnloadRunnable, IDLE_UNLOAD_TIMEOUT_MS)
  }

  private fun unloadNativeModelInternal() {
    val ptr = nativeContextPointer.getAndSet(0L)
    if (ptr != 0L && LafinaLlamaBridge.isLoaded()) {
      try {
        LafinaLlamaBridge.freeModel(ptr)
        Log.i(TAG, "Unloaded on-device SLM context after inactivity.")
      } catch (e: Exception) {
        Log.e(TAG, "Error freeing native model context", e)
      }
    }
    loadedModelPath = null
  }

  @ReactMethod
  fun isModelAvailable(modelPath: String, promise: Promise) {
    try {
      val file = File(modelPath)
      val available = file.exists() && file.isFile && file.length() > 100_000_000L
      promise.resolve(available)
    } catch (e: Exception) {
      promise.resolve(false)
    }
  }

  @ReactMethod
  fun unloadModel(promise: Promise) {
    executor.execute {
      unloadNativeModelInternal()
      promise.resolve(true)
    }
  }

  @ReactMethod
  fun extractIntent(options: ReadableMap, promise: Promise) {
    val transcript = if (options.hasKey("transcript")) options.getString("transcript") ?: "" else ""
    val modelPath = if (options.hasKey("modelPath")) options.getString("modelPath") else null

    executor.execute {
      try {
        val trimmed = transcript.trim()
        if (trimmed.isEmpty()) {
          val empty = JSONObject().apply {
            put("intent", "out_of_scope")
            put("title", JSONObject.NULL)
            put("date", JSONObject.NULL)
            put("time", JSONObject.NULL)
            put("duration_minutes", JSONObject.NULL)
            put("status", "rejected")
            put("reply", "No speech detected.")
          }
          promise.resolve(empty.toString())
          return@execute
        }

        // Check if dynamic model is available and requested
        if (!modelPath.isNullOrBlank() && LafinaLlamaBridge.isLoaded()) {
          val modelFile = File(modelPath)
          if (modelFile.exists() && modelFile.length() > 100_000_000L) {
            try {
              val resultJson = executeOnDeviceLlm(modelPath, trimmed)
              if (resultJson != null) {
                scheduleAutoUnload()
                promise.resolve(resultJson)
                return@execute
              }
            } catch (e: Exception) {
              Log.w(TAG, "On-device SLM inference failed, falling back to deterministic fast path", e)
            }
          }
        }

        // Fast-path deterministic Kotlin parser
        val fastResult = executeFastPath(trimmed)
        promise.resolve(fastResult)
      } catch (e: Exception) {
        promise.reject("NLU_EXTRACT_ERROR", e.message, e)
      }
    }
  }

  private fun executeOnDeviceLlm(modelPath: String, transcript: String): String? {
    var ptr = nativeContextPointer.get()
    if (ptr == 0L || loadedModelPath != modelPath) {
      unloadNativeModelInternal()
      val nThreads = maxOf(2, minOf(4, Runtime.getRuntime().availableProcessors() - 1))
      ptr = LafinaLlamaBridge.initModel(modelPath, nThreads)
      if (ptr == 0L) return null
      nativeContextPointer.set(ptr)
      loadedModelPath = modelPath
    }

    val prompt = """
      <|im_start|>system
      You are LAFINA's on-device academic NLU extractor. Extract student intent from speech into valid JSON only.

      CRITICAL TITLE RULES:
      1. Rewrite "title" into a concise, clean Title Case noun phrase or imperative verb phrase (2 to 6 words).
      2. Strip ALL dates, times, relative time words ("tomorrow", "morrow", "tmrw", "today", "tonight", "9am", "at 2pm", "in 10 minutes", "after class").
      3. Strip ALL command prefixes and conversational filler ("remind me to", "I need to", "I have to", "don't forget to", "add a task for", "create a timeblock for", "please").

      JSON SCHEMA:
      {"intent":"create_task"|"create_time_block"|"create_reminder"|"create_note"|"query_schedule"|"acknowledge"|"snooze"|"reschedule", "title":string|null, "date":string|null, "time":string|null, "category":"Academic"|"Personal"}

      FEW-SHOT EXAMPLES:
      User: Morrow 9am coffee break
      Assistant: {"intent":"create_task","title":"Coffee Break","date":null,"time":"09:00","category":"Personal"}

      User: I need to finish studying for my operating systems midterm tomorrow at 8pm
      Assistant: {"intent":"create_task","title":"Study for Operating Systems Midterm","date":null,"time":"20:00","category":"Academic"}

      User: Remind me in ten minutes for a coffee break
      Assistant: {"intent":"create_reminder","title":"Coffee Break","date":null,"time":null,"category":"Personal"}

      User: Create a timeblock from 9am to 12 noon for thesis writing
      Assistant: {"intent":"create_time_block","title":"Thesis Writing","date":null,"time":"09:00","category":"Academic"}

      User: What is my schedule for today
      Assistant: {"intent":"query_schedule","title":null,"date":null,"time":null,"category":"Academic"}
      <|im_end|>
      <|im_start|>user
      $transcript
      <|im_end|>
      <|im_start|>assistant
    """.trimIndent()

    val rawOutput = LafinaLlamaBridge.generate(ptr, prompt, 128)
    val jsonStart = rawOutput.indexOf('{')
    val jsonEnd = rawOutput.lastIndexOf('}')
    if (jsonStart != -1 && jsonEnd != -1 && jsonEnd > jsonStart) {
      val jsonCandidate = rawOutput.substring(jsonStart, jsonEnd + 1)
      JSONObject(jsonCandidate) // Verify valid JSON
      return jsonCandidate
    }
    return null
  }

  private fun cleanTitleFallback(text: String): String {
    var cleaned = text.trim()
    cleaned = cleaned.replace(
      Regex(
        "^(?:please\\s+)?(?:i\\s+(?:really\\s+)?(?:need|have|got|want)\\s+to\\s+|i\\s+(?:really\\s+)?gotta\\s+|don'?t\\s+forget\\s+(?:to\\s+)?|make\\s+sure\\s+(?:i\\s+|to\\s+)?|remind\\s+me\\s+(?:to\\s+|for\\s+)?|set\\s+a?\\s*reminder\\s+(?:to\\s+|for\\s+)?|create\\s+a?\\s*(?:time\\s*block|timeblock|task|reminder|note)\\s*(?:for\\s+|to\\s+)?|add\\s+a?\\s*(?:time\\s*block|timeblock|study\\s+block|task|reminder|note)\\s*(?:for\\s+|to\\s+)?)+",
        RegexOption.IGNORE_CASE
      ),
      ""
    )
    cleaned = cleaned.replace(
      Regex(
        "\\b(?:to-?morrow|morrow|tmrw|today|tonight|this\\s+(?:morning|afternoon|evening|weekend)|next\\s+(?:week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|(?:on\\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|(?:at|from|by|around)\\s+\\d{1,4}(?::\\d{2})?\\s*(?:am|pm|noon|midnight)?|\\d{1,4}(?::\\d{2})?\\s*(?:am|pm)|(?:after|before)\\s+(?:class|school|lunch|dinner|work))\\b",
        RegexOption.IGNORE_CASE
      ),
      " "
    )
    cleaned = cleaned
      .replace(Regex("^(?:finish|start)\\s+studying\\b", RegexOption.IGNORE_CASE), "study")
      .replace(Regex("^[\\s,;:-]+|[\\s,;:-]+$"), "")
      .replace(Regex("\\s+"), " ")
      .trim()
    return if (cleaned.isNotEmpty()) cleaned else text.trim()
  }

  private fun executeFastPath(text: String): String {
    val lower = text.lowercase()

    // 1. Call response / acknowledge
    if (lower.matches(Regex("^(i did it|done|got it|okay|ok|understood|acknowledged|thanks?)\\b.*"))) {
      return JSONObject().apply {
        put("intent", "acknowledge")
        put("title", JSONObject.NULL)
        put("date", JSONObject.NULL)
        put("time", JSONObject.NULL)
        put("duration_minutes", JSONObject.NULL)
        put("status", "success")
        put("reply", "Great job! Acknowledged.")
      }.toString()
    }

    // 2. Call response / snooze
    val snoozeMatch = Regex("\\b(?:snooze|remind me in|give me)\\s*(?:for\\s+)?(\\d+)?\\s*(?:min|mins|minutes)?\\b").find(lower)
    if (snoozeMatch != null || lower.startsWith("snooze")) {
      val mins = snoozeMatch?.groupValues?.getOrNull(1)?.toIntOrNull() ?: 10
      return JSONObject().apply {
        put("intent", "snooze")
        put("title", JSONObject.NULL)
        put("date", JSONObject.NULL)
        put("time", JSONObject.NULL)
        put("duration_minutes", mins)
        put("status", "success")
        put("reply", "Snoozed for $mins minutes.")
      }.toString()
    }

    // 3. Schedule query / audit
    if (Regex("\\b(what(?:'s|s| is| are) (?:on |in |for )?(?:my )?(?:schedule|calendar|agenda|plans?|tasks?)|schedule audit|audit my schedule|check my schedule|show my schedule|tell me my schedule|what do i have)\\b").containsMatchIn(lower)) {
      return JSONObject().apply {
        put("intent", "query_schedule")
        put("title", JSONObject.NULL)
        put("date", JSONObject.NULL)
        put("time", JSONObject.NULL)
        put("duration_minutes", JSONObject.NULL)
        put("status", "success")
        put("reply", "Checking schedule.")
      }.toString()
    }

    // 4. Fallback generic intent
    var intent = "create_task"
    if (lower.contains("remind me") || lower.contains("reminder")) intent = "create_reminder"
    else if (lower.contains("time block") || lower.contains("timeblock") || lower.contains("block")) intent = "create_time_block"
    else if (lower.contains("note")) intent = "create_note"

    val distilledTitle = cleanTitleFallback(text)

    return JSONObject().apply {
      put("intent", intent)
      put("title", distilledTitle)
      put("date", JSONObject.NULL)
      put("time", JSONObject.NULL)
      put("duration_minutes", JSONObject.NULL)
      put("status", "success")
      put("reply", "Processed: $distilledTitle")
    }.toString()
  }

  override fun onCatalystInstanceDestroy() {
    super.onCatalystInstanceDestroy()
    mainHandler.removeCallbacks(autoUnloadRunnable)
    executor.execute {
      unloadNativeModelInternal()
    }
  }
}
