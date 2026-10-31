package com.lafina.capstone.reminders

import android.app.Notification
import android.app.NotificationManager
import android.accessibilityservice.AccessibilityService
import android.net.Uri
import android.os.SystemClock
import android.view.accessibility.AccessibilityNodeInfo
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.util.ArrayDeque

/** Opt-in real shade interaction. No Activity intent, receiver, PendingIntent.send or DB writes. */
class ReminderNotificationUiTest : Qa08UiDriver() {
  @Test fun dispatchOnlyOwnedSystemUiNotification() {
    val args = InstrumentationRegistry.getArguments()
    val mode = args.getString("qa08_mode")
    assumeTrue("Explicit QA08 notification mode required", mode != null)
    require(mode in setOf("open", "ack", "snooze", "open-manual-ack", "open-typed-ack")) { "UNSUPPORTED_QA08_NOTIFICATION_MODE" }
    prepareAutomation()
    try {
      val value = fixture(args)
      assertOwnedNotification(value)
      assertTrue("Android must open its notification shade", automation.performGlobalAction(
        AccessibilityService.GLOBAL_ACTION_NOTIFICATIONS))
      val action = when (mode) { "ack" -> "Acknowledge"; "snooze" -> "Snooze 10m"; else -> null }
      dispatch(value, action, args.getString("qa08_duplicate") == "true")
      if (mode!!.startsWith("open")) {
        awaitOwnedNativeReminder(value)
        if (mode == "open-manual-ack" || mode == "open-typed-ack") {
          if (mode == "open-typed-ack") {
            click("Answer")
            waitFor("REMINDER RESPONSE").recycle()
            setText("Reminder draft text", "acknowledge")
            click("Review response")
          } else click("Acknowledge / Dismiss")
          waitFor("Review reminder response").recycle()
          click("Confirm")
          waitAbsent("Review reminder response")
          waitAbsent("REMINDER RESPONSE")
          waitAbsent("SIMULATED REMINDER · NOT A PHONE CALL")
          stages.add("notification_open_reviewed_ack_confirmed")
        }
      } else {
        val until = SystemClock.elapsedRealtime() + 10_000
        while (visible(value) && SystemClock.elapsedRealtime() < until) SystemClock.sleep(100)
        assertTrue("Owned notification must close after its action", !visible(value))
        // Finishing instrumentation can kill every target-UID process, including
        // a goAsync receiver between its saved action and OS reconciliation.
        // A read-only provider call waits for that process's existing store lock;
        // it never calls reconcile or repairs a failed action for the assertion.
        val barrier = context.contentResolver.call(
          Uri.parse("content://${context.packageName}.reminders"), "capabilities", null, null)
        assertTrue("The receiver must release its store lock before the driver exits",
          barrier != null && barrier.getString("json") != null && !barrier.containsKey("error"))
        stages.add("read_only_remote_store_barrier_completed")
        stages.add("owned_notification_action_dispatched")
      }
      emit(mode!!, "PASS", key = "phase08_notification_ui_driver",
        launch = "ACTUAL_SYSTEMUI_NOTIFICATION_SHADE")
    } catch (failure: Throwable) {
      emit(mode!!, "FAIL", failure.javaClass.simpleName, "phase08_notification_ui_driver",
        launch = "ACTUAL_SYSTEMUI_NOTIFICATION_SHADE")
      throw failure
    }
  }

  /** Reuses the actual shade entry for lifecycle tests; it never starts a private Activity intent. */
  internal fun openOwnedNotification(value: Qa08UiFixture) {
    prepareAutomation()
    assertOwnedNotification(value)
    assertTrue("Android must open its notification shade", automation.performGlobalAction(
      AccessibilityService.GLOBAL_ACTION_NOTIFICATIONS))
    dispatch(value, null, false)
    awaitOwnedNativeReminder(value)
  }

  private fun awaitOwnedNativeReminder(value: Qa08UiFixture) {
    waitFor("SIMULATED REMINDER · NOT A PHONE CALL").recycle()
    waitFor(value.title).recycle()
    reveal("Answer").recycle()
    stages.add("system_notification_opened_owned_reminder")
  }

  private fun assertOwnedNotification(value: Qa08UiFixture) {
    val tag = ReminderIdentityKey.value(context.packageName, value.identity, ReminderIntents.OPEN)
    val matches = context.getSystemService(NotificationManager::class.java).activeNotifications
      .filter { it.tag == tag && it.id == 0 }
    assertEquals("One notification for the exact owned identity is required", 1, matches.size)
    assertTrue("Notification title must match its owned fixture",
      matches.single().notification.extras.getCharSequence(Notification.EXTRA_TITLE)?.toString() == value.title)
  }

  private fun visible(value: Qa08UiFixture): Boolean {
    val tag = ReminderIdentityKey.value(context.packageName, value.identity, ReminderIntents.OPEN)
    return context.getSystemService(NotificationManager::class.java).activeNotifications.any { it.tag == tag && it.id == 0 }
  }

  private fun dispatch(value: Qa08UiFixture, action: String?, duplicate: Boolean) {
    val until = SystemClock.elapsedRealtime() + 12_000
    do {
      assertOwnedNotification(value)
      val row = ownedRow(value.title)
      if (row != null) {
        try {
          val descendants = descendants(row)
          try {
            val wanted = descendants.firstOrNull { it.text?.toString()?.equals(action ?: value.title, true) == true }
            if (wanted != null && clickWithin(wanted, row)) {
              stages.add(if (action == null) "exact_owned_notification_body_clicked" else "exact_owned_notification_action_clicked")
              if (duplicate && action != null) {
                try { wanted.performAction(AccessibilityNodeInfo.ACTION_CLICK) } catch (_: IllegalStateException) { }
                stages.add("same_systemui_action_node_replayed")
              }
              return
            }
            // Only expand the row already verified to contain this exact title and body.
            val expand = descendants.firstOrNull {
              it.contentDescription?.toString()?.startsWith("Expand", ignoreCase = true) == true
            }
            if (expand != null) clickWithin(expand, row)
          } finally { descendants.forEach { it.recycle() } }
        } finally { row.recycle() }
      }
      SystemClock.sleep(150)
    } while (SystemClock.elapsedRealtime() < until)
    throw AssertionError("EXACT_OWNED_SYSTEMUI_NOTIFICATION_ACTION_NOT_AVAILABLE")
  }

  private fun ownedRow(title: String): AccessibilityNodeInfo? {
    val nodes = activeSurfaceNodes("com.android.systemui")
    var best: AccessibilityNodeInfo? = null
    try {
      val titleNode = nodes.firstOrNull { it.text?.toString() == title } ?: return null
      var candidate = titleNode.parent
      repeat(10) {
        val current = candidate ?: return best
        candidate = current.parent
        val id = current.viewIdResourceName.orEmpty()
        val rowLike = id.endsWith("/row") || id.endsWith("/status_bar_latest_event_content") ||
          id.endsWith("/expandableNotificationRow") ||
          current.className?.toString()?.endsWith("ExpandableNotificationRow") == true
        if (rowLike) {
          val children = descendants(current)
          val verified = try {
            children.any { it.text?.toString() == title } &&
              children.any { it.text?.toString() == "Academic reminder · tap to open" } &&
              children.none { it.viewIdResourceName?.endsWith("/title") == true &&
                it.text?.toString()?.let { text -> text.isNotBlank() && text != title } == true }
          } finally { children.forEach { it.recycle() } }
          if (verified) { best?.recycle(); best = AccessibilityNodeInfo.obtain(current) }
        }
        current.recycle()
      }
      candidate?.recycle()
      return best
    } finally { nodes.forEach { it.recycle() } }
  }

  private fun clickWithin(node: AccessibilityNodeInfo, boundary: AccessibilityNodeInfo): Boolean {
    if (node.isEnabled && node.performAction(AccessibilityNodeInfo.ACTION_CLICK)) return true
    var candidate = node.parent
    repeat(8) {
      val current = candidate ?: return false
      val atBoundary = current == boundary
      candidate = if (atBoundary) null else current.parent
      val clicked = current.isClickable && current.isEnabled && current.performAction(AccessibilityNodeInfo.ACTION_CLICK)
      current.recycle()
      if (clicked) { candidate?.recycle(); return true }
      if (atBoundary) return false
    }
    candidate?.recycle()
    return false
  }

  private fun descendants(root: AccessibilityNodeInfo): List<AccessibilityNodeInfo> {
    val result = mutableListOf<AccessibilityNodeInfo>()
    val pending = ArrayDeque<AccessibilityNodeInfo>()
    pending.add(AccessibilityNodeInfo.obtain(root))
    while (pending.isNotEmpty()) {
      val current = pending.removeFirst()
      result.add(current)
      for (index in 0 until current.childCount) current.getChild(index)?.let { pending.add(it) }
    }
    return result
  }
}
