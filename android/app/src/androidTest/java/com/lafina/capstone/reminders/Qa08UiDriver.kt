package com.lafina.capstone.reminders

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.content.Intent
import android.os.Bundle
import android.os.SystemClock
import android.util.Base64
import android.view.accessibility.AccessibilityNodeInfo
import android.view.accessibility.AccessibilityWindowInfo
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertTrue
import java.util.ArrayDeque

/** Test-only foreground accessibility support. It never reads a database or starts a mic. */
open class Qa08UiDriver {
  protected val instrumentation get() = InstrumentationRegistry.getInstrumentation()
  protected val context get() = instrumentation.targetContext
  protected val automation get() = instrumentation.uiAutomation
  protected val stages = mutableListOf<String>()
  private var lastUiFailure: JSONObject? = null

  protected fun prepareAutomation() {
    automation.serviceInfo = automation.serviceInfo.apply {
      flags = flags or AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS
    }
  }

  protected fun decoded(args: Bundle, key: String, maximum: Int): String {
    val encoded = args.getString(key).orEmpty()
    require(encoded.isNotEmpty() && encoded.length <= 6000) { "QA08_BASE64_ARGUMENT_REQUIRED" }
    val value = try { String(Base64.decode(encoded, Base64.DEFAULT), Charsets.UTF_8) }
      catch (_: IllegalArgumentException) { throw IllegalArgumentException("INVALID_QA08_BASE64") }
    require(value.isNotBlank() && value.length <= maximum && value.all { it.code in 32..126 }) {
      "QA08_ARGUMENT_MUST_BE_BOUNDED_PRINTABLE_ASCII"
    }
    return value
  }

  protected fun fixture(args: Bundle, prefix: String = "qa08_"): Qa08UiFixture {
    val title = decoded(args, "${prefix}title_base64", 200)
    require(title.startsWith("QA08 ")) { "ONLY_OWN_QA08_TITLE_ALLOWED" }
    val generation = args.getString("${prefix}generation")?.toIntOrNull() ?: 0
    val identity = ReminderIdentity(decoded(args, "${prefix}job_base64", 1024),
      decoded(args, "${prefix}occurrence_base64", 1024), generation)
    ReminderPolicy.validateIdentity(identity)
    return Qa08UiFixture(identity, title)
  }

  protected fun openFixture(value: Qa08UiFixture, answer: Boolean = true) {
    start(ReminderIntents.intent(context, value.identity, ReminderIntents.OPEN))
    waitFor("SIMULATED REMINDER · NOT A PHONE CALL").recycle()
    waitFor(value.title).recycle()
    stages.add("owned_fixture_title_observed")
    reveal("Answer").recycle()
    stages.add("answer_control_revealed")
    if (answer) {
      click("Answer")
      waitFor("REMINDER RESPONSE").recycle()
      stages.add("answer_response_visible")
    }
  }

  protected fun startMain() {
    start(Intent().setClassName(context.packageName, "${context.packageName}.MainActivity"))
  }

  protected fun start(intent: Intent) {
    hideKeyboard()
    instrumentation.runOnMainSync {
      context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
    stages.add("activity_launch_requested")
  }

  protected fun hideKeyboard() {
    if (automation.windows.any { it.type == AccessibilityWindowInfo.TYPE_INPUT_METHOD }) {
      automation.performGlobalAction(AccessibilityService.GLOBAL_ACTION_BACK)
      SystemClock.sleep(250)
    }
  }

  protected fun setText(label: String, value: String) {
    val editor = waitFor(label)
    try {
      // Reject a matching caption: only the explicitly labelled editable control is valid.
      assertTrue("QA08_EXPECTED_EDITABLE_CONTROL: $label", editor.isEditable)
      editor.performAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_SHOW_ON_SCREEN.id)
      assertTrue("QA08_WHOLE_FIELD_REPLACEMENT_FAILED: $label", editor.performAction(
        AccessibilityNodeInfo.ACTION_SET_TEXT, Bundle().apply {
          putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, value)
        }))
    } finally { editor.recycle() }
    hideKeyboard()
  }

  protected fun text(label: String): String {
    val node = waitFor(label)
    return try {
      // Android accessibility can expose an empty EditText's hint as text.
      if (node.isEditable && node.isShowingHintText) "" else node.text?.toString().orEmpty()
    } finally { node.recycle() }
  }

  protected fun checked(label: String): Boolean {
    val node = reveal(label)
    return try { node.isChecked } finally { node.recycle() }
  }

  protected fun reveal(label: String): AccessibilityNodeInfo {
    return revealEither(label)
  }

  protected fun revealEither(vararg labels: String): AccessibilityNodeInfo {
    val until = SystemClock.elapsedRealtime() + 10_000
    var forward = true
    do {
      val node = labels.firstNotNullOfOrNull { find(it) }
      if (node != null) {
        node.performAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_SHOW_ON_SCREEN.id)
        return node
      }
      if (!scroll(forward)) forward = !forward
      SystemClock.sleep(150)
    } while (SystemClock.elapsedRealtime() < until)
    recordUiFailure("REVEAL_TIMEOUT", labels.firstOrNull())
    throw AssertionError("QA08_UI_LABEL_NOT_AVAILABLE: ${labels.joinToString()}")
  }

  protected fun click(label: String) {
    val until = SystemClock.elapsedRealtime() + 10_000
    var forward = true
    do {
      val node = find(label)
      if (node != null) {
        try {
          node.performAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_SHOW_ON_SCREEN.id)
          if (node.isEnabled && node.performAction(AccessibilityNodeInfo.ACTION_CLICK)) return
          var parent = node.parent
          repeat(6) {
            val current = parent ?: return@repeat
            parent = current.parent
            val clicked = current.isClickable && current.isEnabled &&
              current.performAction(AccessibilityNodeInfo.ACTION_CLICK)
            current.recycle()
            if (clicked) { parent?.recycle(); return }
          }
          parent?.recycle()
        } finally { node.recycle() }
      }
      if (!scroll(forward)) forward = !forward
      SystemClock.sleep(150)
    } while (SystemClock.elapsedRealtime() < until)
    throw AssertionError("QA08_UI_ACTION_NOT_AVAILABLE: $label")
  }

  protected fun waitFor(label: String): AccessibilityNodeInfo {
    val until = SystemClock.elapsedRealtime() + 10_000
    do {
      find(label)?.let { return it }
      SystemClock.sleep(100)
    } while (SystemClock.elapsedRealtime() < until)
    recordUiFailure("WAIT_FOR_TIMEOUT", label)
    throw AssertionError("QA08_UI_LABEL_NOT_AVAILABLE: $label")
  }

  protected fun waitMatching(timeout: Long, predicate: (AccessibilityNodeInfo) -> Boolean): AccessibilityNodeInfo {
    val until = SystemClock.elapsedRealtime() + timeout
    do {
      val nodes = nodes()
      val match = nodes.firstOrNull(predicate)
      nodes.filter { it !== match }.forEach { it.recycle() }
      if (match != null) return match
      SystemClock.sleep(150)
    } while (SystemClock.elapsedRealtime() < until)
    throw AssertionError("QA08_EXPECTED_RESPONSE_STATE_NOT_VISIBLE")
  }

  protected fun waitAbsent(label: String) {
    val until = SystemClock.elapsedRealtime() + 10_000
    var absentSince: Long? = null
    do {
      if (!present(label)) {
        val now = SystemClock.elapsedRealtime()
        if (absentSince == null) absentSince = now
        if (now - absentSince >= 500) return
      } else absentSince = null
      SystemClock.sleep(100)
    } while (SystemClock.elapsedRealtime() < until)
    throw AssertionError("QA08_UI_DID_NOT_CLOSE: $label")
  }

  protected fun present(label: String): Boolean = find(label)?.let { it.recycle(); true } ?: false

  protected fun find(label: String): AccessibilityNodeInfo? {
    val nodes = nodes()
    val match = nodes.firstOrNull { it.contentDescription?.toString() == label }
      ?: nodes.firstOrNull { it.text?.toString() == label }
      ?: nodes.firstOrNull { it.text?.toString()?.equals(label, ignoreCase = true) == true }
    nodes.filter { it !== match }.forEach { it.recycle() }
    return match
  }

  private fun nodes(): List<AccessibilityNodeInfo> {
    val queue = ArrayDeque<AccessibilityNodeInfo>()
    automation.rootInActiveWindow?.let { queue.add(it) }
    val result = mutableListOf<AccessibilityNodeInfo>()
    while (queue.isNotEmpty()) {
      val node = queue.removeFirst()
      if (node.packageName?.toString() != context.packageName) { node.recycle(); continue }
      result.add(node)
      for (index in 0 until node.childCount) node.getChild(index)?.let { queue.add(it) }
    }
    return result
  }

  /** Explicit system surfaces only; RemoteViews descendants may use Android resource packages. */
  protected fun activeSurfaceNodes(expectedPackage: String): List<AccessibilityNodeInfo> {
    val root = automation.rootInActiveWindow ?: return emptyList()
    if (root.packageName?.toString() != expectedPackage) { root.recycle(); return emptyList() }
    val queue = ArrayDeque<AccessibilityNodeInfo>()
    queue.add(root)
    val result = mutableListOf<AccessibilityNodeInfo>()
    while (queue.isNotEmpty()) {
      val node = queue.removeFirst()
      result.add(node)
      for (index in 0 until node.childCount) node.getChild(index)?.let { queue.add(it) }
    }
    return result
  }

  private fun scroll(forward: Boolean): Boolean {
    val nodes = nodes()
    return try { nodes.firstOrNull { it.isScrollable }?.performAction(
      if (forward) AccessibilityNodeInfo.ACTION_SCROLL_FORWARD else AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD) == true }
    finally { nodes.forEach { it.recycle() } }
  }

  private fun recordUiFailure(reason: String, requestedLabel: String?) {
    // Never dump a tree, titles, drafts, transcripts or arbitrary accessibility text.
    val controls = linkedMapOf(
      "answer" to "Answer", "response" to "REMINDER RESPONSE",
      "native_header" to "SIMULATED REMINDER · NOT A PHONE CALL",
      "review_response" to "Review response", "pending_review" to "Review reminder response",
      "confirm" to "Confirm", "keep_editing" to "Keep editing",
      "not_understood" to "Response not understood", "draft" to "Reminder draft text",
      "manual_ack" to "Acknowledge / Dismiss", "manual_snooze" to "Snooze 10 minutes",
      "close_without_response" to "Close without responding", "close_recovery" to "Close",
      "chat" to "Chat", "message" to "Message", "preferences" to "Planner preferences",
      "ended_recovery" to "This reminder has ended. Your planner remains available.",
    )
    fun identifier(value: CharSequence?): String = value?.toString()?.takeIf {
      it.length <= 180 && Regex("[A-Za-z0-9_.$]+").matches(it)
    } ?: "unavailable_or_redacted"
    try {
      val diagnostic = JSONObject().put("reason", reason).put("requestedControl",
        controls.entries.firstOrNull { it.value == requestedLabel }?.key ?: "fixture_or_unlisted_control")
      val root = automation.rootInActiveWindow
      try {
        diagnostic.put("activePackage", identifier(root?.packageName))
          .put("activeRootClass", identifier(root?.className))
      } finally { root?.recycle() }
      val current = nodes()
      try {
        val visibleControls = JSONArray()
        for ((key, label) in controls) {
          if (current.any { it.isVisibleToUser &&
            (it.contentDescription?.toString() == label || it.text?.toString()?.equals(label, true) == true) }) {
            visibleControls.put(key)
          }
        }
        diagnostic.put("visibleKnownControls", visibleControls)
          .put("appNodeCount", current.size)
          .put("appNodeClasses", JSONArray(current.map { identifier(it.className) }.distinct().sorted().take(12)))
      } finally { current.forEach { it.recycle() } }
      lastUiFailure = diagnostic
      instrumentation.sendStatus(0, Bundle().apply { putString("phase08_ui_diagnostic", diagnostic.toString()) })
    } catch (_: Exception) {
      // Diagnostics must not replace the original, actionable UI timeout.
      stages.add("ui_diagnostic_unavailable")
    }
  }

  protected fun emit(mode: String, outcome: String, errorClass: String? = null,
    key: String = "phase08_ui_driver", extra: JSONObject? = null,
    launch: String = "DIRECT_PRIVATE_ACTIVITY_INTENT_NOT_NOTIFICATION_TAP") {
    val data = JSONObject().put("kind", "OPT_IN_SYNTHETIC_FIXTURE_UI_DRIVER")
      .put("mode", mode).put("outcome", outcome).put("stages", JSONArray(stages))
      .put("launch", launch)
      .put("limits", "UI only; root verifies SQL separately. No live speech, audio or physical-phone acceptance.")
    if (errorClass != null) data.put("errorClass", errorClass)
    if (lastUiFailure != null) data.put("uiDiagnostic", lastUiFailure)
    if (extra != null) data.put("details", extra)
    instrumentation.sendStatus(0, Bundle().apply { putString(key, data.toString()) })
  }
}

data class Qa08UiFixture(val identity: ReminderIdentity, val title: String)
