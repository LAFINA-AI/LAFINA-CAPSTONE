package com.lafina.capstone

import android.content.Context
import android.content.SharedPreferences

/**
 * Floating LAFINA (ADR-036): device-local state the service needs without JS.
 * `enabled` and `ownerId` mirror the signed-in student's setting, which JS
 * owns; the rest is the orb's own state. No message text is ever stored here.
 */
class FloatingAssistantPrefs(context: Context) {
  private val prefs: SharedPreferences =
      context.applicationContext.getSharedPreferences(FILE, Context.MODE_PRIVATE)

  var enabled: Boolean
    get() = prefs.getBoolean(KEY_ENABLED, false)
    set(value) = prefs.edit().putBoolean(KEY_ENABLED, value).apply()

  var ownerId: String?
    get() = prefs.getString(KEY_OWNER, null)
    set(value) = prefs.edit().putString(KEY_OWNER, value).apply()

  var placement: OrbPlacement
    get() = OrbPlacement(
        OrbEdge.parse(prefs.getString(KEY_EDGE, null)),
        prefs.getFloat(KEY_FRACTION, OrbPlacement.DEFAULT.fraction))
    set(value) = prefs.edit()
        .putString(KEY_EDGE, value.edge.name)
        .putFloat(KEY_FRACTION, value.fraction)
        .apply()

  /** ARGB fill; LAFINA red until the app sends the theme's primary colour. */
  var color: Int
    get() = prefs.getInt(KEY_COLOR, DEFAULT_COLOR)
    set(value) = prefs.edit().putInt(KEY_COLOR, value).apply()

  /** Set by Hide; cleared when the student opens LAFINA again. */
  var hiddenUntilAppOpen: Boolean
    get() = prefs.getBoolean(KEY_HIDDEN, false)
    set(value) = prefs.edit().putBoolean(KEY_HIDDEN, value).apply()

  /** An orb tap once failed to open Quick Chat (an OEM background-start block). */
  var launchBlockedSeen: Boolean
    get() = prefs.getBoolean(KEY_LAUNCH_BLOCKED, false)
    set(value) = prefs.edit().putBoolean(KEY_LAUNCH_BLOCKED, value).apply()

  fun resetPlacement() {
    prefs.edit().remove(KEY_EDGE).remove(KEY_FRACTION).apply()
  }

  /** The student's look for the button; [color] is the theme colour when no custom colour is chosen. */
  var look: OrbLook
    get() {
      val d = OrbLook.DEFAULT
      return OrbLook(
          style = OrbStyle.parse(prefs.getString(KEY_STYLE, null)) ?: d.style,
          size = OrbSize.parse(prefs.getString(KEY_SIZE, null)) ?: d.size,
          idleOpacity = OrbLook.clampOpacity(prefs.getInt(KEY_OPACITY, d.idleOpacity)),
          color = if (prefs.contains(KEY_CUSTOM_COLOR)) prefs.getInt(KEY_CUSTOM_COLOR, DEFAULT_COLOR) else null,
          tuckWhenIdle = prefs.getBoolean(KEY_TUCK, d.tuckWhenIdle),
          lockPosition = prefs.getBoolean(KEY_LOCK, d.lockPosition),
          hideInFullscreen = prefs.getBoolean(KEY_FULLSCREEN, d.hideInFullscreen))
    }
    set(value) {
      val edit = prefs.edit()
          .putString(KEY_STYLE, value.style.code)
          .putString(KEY_SIZE, value.size.code)
          .putInt(KEY_OPACITY, OrbLook.clampOpacity(value.idleOpacity))
          .putBoolean(KEY_TUCK, value.tuckWhenIdle)
          .putBoolean(KEY_LOCK, value.lockPosition)
          .putBoolean(KEY_FULLSCREEN, value.hideInFullscreen)
      val custom = value.color
      if (custom == null) edit.remove(KEY_CUSTOM_COLOR) else edit.putInt(KEY_CUSTOM_COLOR, custom or 0xFF000000.toInt())
      edit.apply()
    }

  /** The colour actually drawn: the student's choice, else the theme colour. */
  val effectiveColor: Int
    get() = look.color ?: color

  fun resetLook() {
    prefs.edit()
        .remove(KEY_STYLE)
        .remove(KEY_SIZE)
        .remove(KEY_OPACITY)
        .remove(KEY_CUSTOM_COLOR)
        .remove(KEY_TUCK)
        .remove(KEY_LOCK)
        .remove(KEY_FULLSCREEN)
        .apply()
  }

  companion object {
    private const val FILE = "lafina_floating_assistant"
    private const val KEY_ENABLED = "enabled"
    private const val KEY_OWNER = "owner_id"
    private const val KEY_EDGE = "orb_edge"
    private const val KEY_FRACTION = "orb_fraction"
    private const val KEY_COLOR = "orb_color"
    private const val KEY_HIDDEN = "hidden_until_app_open"
    private const val KEY_LAUNCH_BLOCKED = "launch_blocked_seen"
    private const val KEY_STYLE = "orb_style"
    private const val KEY_SIZE = "orb_size"
    private const val KEY_OPACITY = "orb_idle_opacity"
    private const val KEY_CUSTOM_COLOR = "orb_custom_color"
    private const val KEY_TUCK = "orb_tuck_when_idle"
    private const val KEY_LOCK = "orb_lock_position"
    private const val KEY_FULLSCREEN = "orb_hide_in_fullscreen"
    const val DEFAULT_COLOR = 0xFFB8002E.toInt()
  }
}
