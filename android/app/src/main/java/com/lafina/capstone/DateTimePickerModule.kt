package com.lafina.capstone

import android.app.DatePickerDialog
import android.app.TimePickerDialog
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.time.LocalDate
import java.time.LocalTime
import java.util.Calendar
import java.util.Locale

/** Dialogs return components, never epoch instants in an implicit device timezone. */
class DateTimePickerModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private var showing = false // Accessed only on the Android UI thread.
  override fun getName() = "CapstoneDateTimePicker"

  private fun show(promise: Promise, dialog: (android.app.Activity, (String?) -> Unit) -> Unit) {
    val activity = context.currentActivity
    if (activity == null || activity.isFinishing) {
      promise.reject("PICKER_UNAVAILABLE", "Enter the date or time manually.")
      return
    }
    activity.runOnUiThread {
      if (showing || activity.isFinishing || activity.isDestroyed) {
        promise.reject("PICKER_UNAVAILABLE", "Close the current picker or enter the value manually.")
      } else {
        showing = true
        var settled = false
        val finish: (String?) -> Unit = { value ->
          if (!settled) { settled = true; showing = false; promise.resolve(value) }
        }
        try { dialog(activity, finish) }
        catch (_: Exception) {
          showing = false
          if (!settled) { settled = true; promise.reject("PICKER_FAILED", "Enter the date or time manually.") }
        }
      }
    }
  }

  @ReactMethod
  fun pickDate(initial: String, promise: Promise) {
    val date = try { LocalDate.parse(initial).also { require(it.year in 2000..2100) } }
    catch (_: Exception) { promise.reject("INVALID_DATE", "Enter a real date between 2000 and 2100."); return }
    show(promise) { activity, finish ->
      DatePickerDialog(activity, { _, year, month, day ->
        finish(LocalDate.of(year, month + 1, day).toString())
      }, date.year, date.monthValue - 1, date.dayOfMonth).apply {
        datePicker.minDate = Calendar.getInstance().apply { clear(); set(2000, 0, 1) }.timeInMillis
        datePicker.maxDate = Calendar.getInstance().apply { clear(); set(2100, 11, 31, 23, 59, 59) }.timeInMillis
        setOnCancelListener { finish(null) }
        setOnDismissListener { finish(null) }
        show()
      }
    }
  }

  @ReactMethod
  fun pickTime(initial: String, twentyFourHour: Boolean, promise: Promise) {
    val time = try { require(Regex("(?:[01]\\d|2[0-3]):[0-5]\\d").matches(initial)); LocalTime.parse(initial) }
    catch (_: Exception) { promise.reject("INVALID_TIME", "Enter time as HH:mm."); return }
    show(promise) { activity, finish ->
      TimePickerDialog(activity, { _, hour, minute ->
        finish(String.format(Locale.ROOT, "%02d:%02d", hour, minute))
      }, time.hour, time.minute, twentyFourHour).apply {
        setOnCancelListener { finish(null) }
        setOnDismissListener { finish(null) }
        show()
      }
    }
  }
}
