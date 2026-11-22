package com.lafina.capstone

import android.animation.ValueAnimator
import android.app.Activity
import android.app.ActivityManager
import android.app.Application
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.app.AppOpsManager
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.content.res.Configuration
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.hardware.display.DisplayManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.provider.Settings
import android.util.Log
import android.view.Display
import android.view.Gravity
import android.view.View
import android.view.WindowInsets
import android.view.WindowManager
import android.view.animation.DecelerateInterpolator
import java.io.FileDescriptor
import java.io.PrintWriter
import android.widget.TextView
import android.widget.Toast
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat

/**
 * Floating LAFINA (ADR-036): which of LAFINA's own activities are resumed.
 * The orb is shown only when none is (the main screen, Quick Chat, the alarm
 * screen). Main thread only. It sees only this app's activities, never
 * anything about other apps.
 */
object FloatingAssistantVisibility : Application.ActivityLifecycleCallbacks {
  private val resumed = mutableSetOf<Int>()
  private var installed = false
  private var listener: (() -> Unit)? = null

  /** True while MainActivity is resumed. */
  @Volatile
  var mainResumed = false
    private set

  @Volatile
  var anyActivityResumed = false
    private set

  /** Called from MainActivity.onResume (after super): installs once and records it. */
  fun onMainResumed(activity: Activity) {
    install(activity.application)
    mainResumed = true
    add(activity)
  }

  /** Called from MainActivity.onPause. */
  fun onMainPaused(activity: Activity) {
    mainResumed = false
    remove(activity)
  }

  /** Idempotent. Activities resumed before this call are not seen (MainActivity reports itself). */
  fun install(application: Application) {
    if (installed) return
    application.registerActivityLifecycleCallbacks(this)
    installed = true
  }

  fun setListener(value: (() -> Unit)?) {
    listener = value
  }

  private fun add(activity: Activity) {
    if (resumed.add(System.identityHashCode(activity))) changed()
  }

  private fun remove(activity: Activity) {
    if (resumed.remove(System.identityHashCode(activity))) changed()
  }

  private fun changed() {
    anyActivityResumed = resumed.isNotEmpty()
    listener?.invoke()
  }

  override fun onActivityResumed(activity: Activity) {
    if (activity is MainActivity) mainResumed = true
    add(activity)
  }

  override fun onActivityPaused(activity: Activity) {
    if (activity is MainActivity) mainResumed = false
    remove(activity)
  }

  override fun onActivityDestroyed(activity: Activity) = remove(activity)

  override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) = Unit

  override fun onActivityStarted(activity: Activity) = Unit

  override fun onActivityStopped(activity: Activity) = Unit

  override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) = Unit
}

/**
 * Floating LAFINA (ADR-036): the user-enabled `specialUse` foreground service
 * that owns the orb window and the Hide target, and posts the ongoing
 * notification. It has no wake lock, no timers and no polling: it reacts to
 * LAFINA's own activity changes, display on/off and configuration changes.
 * It never reads anything about other apps.
 *
 * Screen state comes from a DisplayManager listener, not SCREEN_ON /
 * USER_PRESENT broadcasts: on the Infinix X6880 (XOS) those broadcasts were
 * skipped for this app while its service ran (FLOAT-02 device check). The
 * lock screen itself hides app overlays (an overlay without
 * FLAG_SHOW_WHEN_LOCKED sits below the keyguard and is hidden by it), so the
 * orb disappears while locked and returns on unlock with no event needed.
 */
class LafinaFloatingAssistantService : Service(), FloatingOrbView.Listener {
  companion object {
    private const val TAG = "LafinaFloating"
    const val CHANNEL_ID = "lafina_floating_v1"
    const val NOTIFICATION_ID = 7410
    private const val ACTION_START = "com.lafina.capstone.FLOATING_START"
    private const val ACTION_HIDE = "com.lafina.capstone.FLOATING_HIDE"
    private const val SHOW_DELAY_MS = 200L
    private const val SNAP_MS = 200L
    /** One-shot check after a tap: did Quick Chat come to the front? */
    private const val LAUNCH_CHECK_MS = 1500L
    private const val HINT_MS = 4000L

    @Volatile
    private var instance: LafinaFloatingAssistantService? = null

    val isRunning: Boolean
      get() = instance != null

    fun isLowRam(context: Context): Boolean =
        (context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager).isLowRamDevice

    /** Setting on, overlay granted, not hidden by the student, not a low-RAM device. */
    fun canRun(context: Context): Boolean {
      val prefs = FloatingAssistantPrefs(context)
      return prefs.enabled &&
          !prefs.hiddenUntilAppOpen &&
          Settings.canDrawOverlays(context) &&
          !isLowRam(context)
    }

    /**
     * Starts the service. Callers only do this while a LAFINA activity is
     * visible, which is what allows a foreground-service start.
     */
    fun start(context: Context): Boolean {
      if (!canRun(context)) return false
      return try {
        ContextCompat.startForegroundService(
            context, Intent(context, LafinaFloatingAssistantService::class.java).setAction(ACTION_START))
        true
      } catch (e: Exception) {
        Log.w(TAG, "Could not start the floating assistant: ${e.javaClass.simpleName}")
        false
      }
    }

    fun stop(context: Context) {
      val service = instance
      if (service != null) {
        service.handler.post { service.shutDown() }
      } else {
        context.stopService(Intent(context, LafinaFloatingAssistantService::class.java))
      }
    }

    /** MainActivity resumed: Hide's "until LAFINA is opened" ends; start if allowed. */
    fun onMainResumed(activity: Activity) {
      FloatingAssistantVisibility.onMainResumed(activity)
      val prefs = FloatingAssistantPrefs(activity)
      if (prefs.hiddenUntilAppOpen) prefs.hiddenUntilAppOpen = false
      if (!isRunning) start(activity)
    }

    fun onMainPaused(activity: Activity) {
      FloatingAssistantVisibility.onMainPaused(activity)
    }

    fun refreshAppearance() {
      instance?.let { service -> service.handler.post { service.applyColor() } }
    }

    /** The student changed the look: rebuild the button with the new style and size. */
    fun refreshLook() {
      instance?.let { service -> service.handler.post { service.rebuildOrb() } }
    }

    fun resetPosition(context: Context) {
      FloatingAssistantPrefs(context).resetPlacement()
      instance?.let { service -> service.handler.post { service.placeOrb() } }
    }

    fun createChannel(context: Context) {
      val channel = NotificationChannel(CHANNEL_ID, "Floating LAFINA", NotificationManager.IMPORTANCE_LOW).apply {
        description = "Shown while the Floating LAFINA button is on"
        setShowBadge(false)
        setSound(null, null)
        enableVibration(false)
      }
      (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(channel)
    }
  }

  private val handler = Handler(Looper.getMainLooper())
  private lateinit var prefs: FloatingAssistantPrefs
  private lateinit var windowManager: WindowManager
  private var orb: FloatingOrbView? = null
  private var orbParams: WindowManager.LayoutParams? = null
  private var orbAttached = false
  private var target: FloatingDismissTargetView? = null
  private var targetAttached = false
  private var targetCenter = 0f to 0f
  private var snapAnimator: ValueAnimator? = null
  private var displayListening = false
  private var opsWatching = false
  private var shuttingDown = false
  private val showRunnable = Runnable { showOrb() }
  private var hint: TextView? = null
  private var hintAttached = false
  /** The look the current button was built with. */
  private var look = OrbLook.DEFAULT
  /** A bubble resting half off the screen. */
  private var tucked = false
  /** Stepped aside while another app is full screen. */
  private var fullscreenHidden = false
  private var dragActive = false
  private val hideHintRunnable = Runnable { removeHint() }

  /** Some phones block opening a screen from a floating button. */
  private val launchCheck = Runnable {
    if (!FloatingAssistantVisibility.anyActivityResumed && !QuickChatActivity.isOpen) {
      Log.i(TAG, "Quick Chat did not open; launch blocked")
      prefs.launchBlockedSeen = true
      showHint("Can't open here. Use the LAFINA notification.")
    }
  }

  private val displayListener = object : DisplayManager.DisplayListener {
    override fun onDisplayChanged(displayId: Int) {
      if (displayId != Display.DEFAULT_DISPLAY) return
      Log.i(TAG, "Display changed (screen usable: ${screenUsable()})")
      applyVisibility()
    }

    override fun onDisplayAdded(displayId: Int) = Unit

    override fun onDisplayRemoved(displayId: Int) = Unit
  }

  private val opsListener = AppOpsManager.OnOpChangedListener { _, packageName ->
    if (packageName != this.packageName) return@OnOpChangedListener
    Log.i(TAG, "Overlay permission changed")
    handler.post {
      if (!Settings.canDrawOverlays(this)) {
        Log.i(TAG, "Overlay permission removed; stopping")
        shutDown()
      }
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    instance = this
    prefs = FloatingAssistantPrefs(this)
    windowManager = getSystemService(WindowManager::class.java)
    FloatingAssistantVisibility.install(application)
    FloatingAssistantVisibility.setListener { applyVisibility() }
    getSystemService(DisplayManager::class.java).registerDisplayListener(displayListener, handler)
    displayListening = true
    try {
      getSystemService(AppOpsManager::class.java)
          .startWatchingMode(AppOpsManager.OPSTR_SYSTEM_ALERT_WINDOW, packageName, opsListener)
      opsWatching = true
    } catch (e: Exception) {
      Log.w(TAG, "Could not watch the overlay permission: ${e.javaClass.simpleName}")
    }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_HIDE) {
      hideUntilAppOpen(showToast = false)
      return START_NOT_STICKY
    }
    if (!canRun(this)) {
      shutDown()
      return START_NOT_STICKY
    }
    shuttingDown = false
    createChannel(this)
    if (intent == null) {
      // Sticky restart from the background (Android 15+ rule): the overlay
      // must be visible before startForeground, and any failure stops quietly.
      if (!shouldShowOrb()) {
        shutDown()
        return START_NOT_STICKY
      }
      showOrb()
      val view = orb
      if (!orbAttached || view == null) {
        shutDown()
        return START_NOT_STICKY
      }
      // Runs after the window's first traversal, when it is on screen.
      view.post { if (!shuttingDown && !startForegroundSafely()) shutDown() }
      return START_STICKY
    }
    if (!startForegroundSafely()) {
      shutDown()
      return START_NOT_STICKY
    }
    applyVisibility()
    return START_STICKY
  }

  private fun startForegroundSafely(): Boolean = try {
    val notification = buildNotification()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
    true
  } catch (e: Exception) {
    Log.w(TAG, "startForeground refused: ${e.javaClass.simpleName}")
    false
  }

  private fun buildNotification(): Notification {
    // Open: the Quick Chat panel (explicit, immutable, not exported).
    val open = PendingIntent.getActivity(
        this,
        0,
        QuickChatActivity.intent(this),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val hide = PendingIntent.getService(
        this,
        1,
        Intent(this, LafinaFloatingAssistantService::class.java).setAction(ACTION_HIDE),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    return NotificationCompat.Builder(this, CHANNEL_ID)
        .setSmallIcon(R.mipmap.ic_launcher)
        .setContentTitle("Floating LAFINA is on")
        .setContentText("Tap the LAFINA button to open Quick Chat.")
        .setCategory(NotificationCompat.CATEGORY_SERVICE)
        .setPriority(NotificationCompat.PRIORITY_LOW)
        .setOngoing(true)
        .setSilent(true)
        .setShowWhen(false)
        .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
        .setContentIntent(open)
        .addAction(0, "Open", open)
        .addAction(0, "Hide", hide)
        .build()
  }

  // ---- Visibility ---------------------------------------------------------

  /** The screen is on. While locked, the keyguard hides the orb by itself. */
  private fun screenUsable(): Boolean {
    val power = getSystemService(PowerManager::class.java)
    val display = getSystemService(DisplayManager::class.java).getDisplay(Display.DEFAULT_DISPLAY)
    return power.isInteractive && (display == null || display.state == Display.STATE_ON)
  }

  private fun shouldShowOrb(): Boolean =
      !shuttingDown &&
          prefs.enabled &&
          !prefs.hiddenUntilAppOpen &&
          Settings.canDrawOverlays(this) &&
          !FloatingAssistantVisibility.anyActivityResumed &&
          screenUsable()

  /** Hides at once; shows after a short settle so moving between LAFINA screens never flashes it. */
  private fun applyVisibility() {
    handler.removeCallbacks(showRunnable)
    // The AppOps watcher did not fire on the Infinix X6880 when the overlay
    // permission was revoked, so every visibility event re-checks it.
    if (!shuttingDown && !Settings.canDrawOverlays(this)) {
      Log.i(TAG, "Overlay permission missing; stopping")
      shutDown()
      return
    }
    if (shouldShowOrb()) {
      if (!orbAttached) handler.postDelayed(showRunnable, SHOW_DELAY_MS)
    } else {
      removeOrb()
    }
  }

  private fun bounds(): OrbBounds {
    val metrics = windowManager.currentWindowMetrics
    val insets = metrics.windowInsets.getInsetsIgnoringVisibility(
        WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout())
    val density = resources.displayMetrics.density
    return OrbBounds.from(
        metrics.bounds.width(),
        metrics.bounds.height(),
        insets.left,
        insets.top,
        insets.right,
        insets.bottom,
        orbWidth(),
        orbHeight(),
        (orbMetrics().margin * density).toInt())
  }

  private fun orbMetrics(): OrbMetrics = OrbMetrics.of(look.style, look.size)

  private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

  private fun orbWidth(): Int = dp(orbMetrics().windowWidth)

  private fun orbHeight(): Int = dp(orbMetrics().windowHeight)

  private fun overlayParams(size: Int, touchable: Boolean) = overlayParams(size, size, touchable)

  private fun overlayParams(width: Int, height: Int, touchable: Boolean) = WindowManager.LayoutParams(
      width,
      height,
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
          WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS or
          (if (touchable) 0 else WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE),
      PixelFormat.TRANSLUCENT,
  ).apply {
    gravity = Gravity.TOP or Gravity.START
    // Screen coordinates: the bounds already keep clear of bars and cutouts.
    fitInsetsTypes = 0
    layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS
    if (!touchable) {
      // Android 12+: a pass-through overlay must stay at or under 0.8 opacity.
      alpha = 0.8f
    }
    title = if (touchable) "LAFINA orb" else "LAFINA hide target"
  }

  private fun showOrb() {
    if (orbAttached || !shouldShowOrb()) return
    look = prefs.look
    val view = orb ?: FloatingOrbView(this, this).also { orb = it }
    view.configure(look, prefs.placement.edge, prefs.effectiveColor)
    val params = orbParams ?: overlayParams(orbWidth(), orbHeight(), touchable = true).also { orbParams = it }
    val (x, y) = FloatingOrbRules.positionFor(prefs.placement, bounds())
    params.x = x
    params.y = y
    tucked = false
    fullscreenHidden = false
    setTouchable(params, true)
    try {
      windowManager.addView(view, params)
      orbAttached = true
      view.wake()
      Log.i(TAG, "Orb shown")
    } catch (e: Exception) {
      // BadTokenException / SecurityException when the permission is gone.
      Log.w(TAG, "Could not show the orb: ${e.javaClass.simpleName}")
      orbAttached = false
    }
  }

  private fun removeOrb() {
    snapAnimator?.cancel()
    snapAnimator = null
    removeTarget()
    removeHint()
    val view = orb ?: return
    if (!orbAttached) return
    view.sleep()
    try {
      windowManager.removeViewImmediate(view)
      Log.i(TAG, "Orb removed")
    } catch (e: Exception) {
      Log.w(TAG, "Could not remove the orb: ${e.javaClass.simpleName}")
    }
    orbAttached = false
  }

  /** Re-applies the stored edge and height to the current screen. */
  private fun placeOrb() {
    val view = orb ?: return
    val params = orbParams ?: return
    if (!orbAttached) return
    snapAnimator?.cancel()
    val (x, y) = FloatingOrbRules.positionFor(prefs.placement, bounds())
    params.x = x
    params.y = y
    tucked = false
    view.setEdge(prefs.placement.edge)
    updateLayout(view, params)
  }

  /** New style or size: drop the old window so the next show uses the new look. */
  private fun rebuildOrb() {
    val wasAttached = orbAttached
    removeOrb()
    orb = null
    orbParams = null
    look = prefs.look
    if (wasAttached) applyVisibility()
  }

  private fun setTouchable(params: WindowManager.LayoutParams, touchable: Boolean) {
    params.flags = if (touchable) {
      params.flags and WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE.inv()
    } else {
      params.flags or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
    }
    // A pass-through window must stay at or under 0.8 opacity (Android 12+); hidden is 0.
    params.alpha = if (touchable) 1f else 0f
  }

  private fun updateLayout(view: View, params: WindowManager.LayoutParams) {
    try {
      windowManager.updateViewLayout(view, params)
    } catch (e: Exception) {
      Log.w(TAG, "Could not move the orb: ${e.javaClass.simpleName}")
    }
  }

  private fun applyColor() {
    orb?.setColor(prefs.effectiveColor)
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    // Rotation, fold or display change: never reuse the old pixels.
    removeTarget()
    placeOrb()
  }

  // ---- Gestures -----------------------------------------------------------

  override fun onOrbTap() {
    Log.i(TAG, "Orb tapped")
    removeHint()
    handler.removeCallbacks(launchCheck)
    val started = try {
      // Allowed from the background because the orb window is visible.
      startActivity(QuickChatActivity.intent(this))
      true
    } catch (e: Exception) {
      Log.w(TAG, "Could not open Quick Chat: ${e.javaClass.simpleName}")
      false
    }
    if (started) {
      handler.postDelayed(launchCheck, LAUNCH_CHECK_MS)
    } else {
      prefs.launchBlockedSeen = true
      showHint("Can't open here. Use the LAFINA notification.")
    }
  }

  /** A short label beside the orb; never touchable, removed after a few seconds. */
  private fun showHint(text: String) {
    val params = orbParams
    if (!orbAttached || params == null || !Settings.canDrawOverlays(this)) {
      Toast.makeText(this, text, Toast.LENGTH_LONG).show()
      return
    }
    removeHint()
    val density = resources.displayMetrics.density
    val view = hint ?: TextView(this).also { hint = it }
    view.text = text
    view.setTextColor(Color.WHITE)
    view.textSize = 13f
    view.maxWidth = (220 * density).toInt()
    view.setPadding((12 * density).toInt(), (8 * density).toInt(), (12 * density).toInt(), (8 * density).toInt())
    view.background = GradientDrawable().apply {
      setColor(0xE6202124.toInt())
      cornerRadius = 12 * density
    }
    val size = orbWidth()
    val gap = (4 * density).toInt()
    val onRight = prefs.placement.edge == OrbEdge.RIGHT
    val screenWidth = windowManager.currentWindowMetrics.bounds.width()
    if (tucked) placeOrb()
    val hintParams = WindowManager.LayoutParams(
        WindowManager.LayoutParams.WRAP_CONTENT,
        WindowManager.LayoutParams.WRAP_CONTENT,
        WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
        WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
            WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or
            WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
        PixelFormat.TRANSLUCENT,
    ).apply {
      gravity = Gravity.TOP or (if (onRight) Gravity.END else Gravity.START)
      fitInsetsTypes = 0
      layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS
      alpha = 0.8f
      x = if (onRight) screenWidth - params.x + gap else params.x + size + gap
      y = params.y + (12 * density).toInt()
      title = "LAFINA hint"
    }
    try {
      windowManager.addView(view, hintParams)
      hintAttached = true
      view.announceForAccessibility(text)
      handler.postDelayed(hideHintRunnable, HINT_MS)
    } catch (e: Exception) {
      Log.w(TAG, "Could not show the hint: ${e.javaClass.simpleName}")
      hintAttached = false
      Toast.makeText(this, text, Toast.LENGTH_LONG).show()
    }
  }

  private fun removeHint() {
    handler.removeCallbacks(hideHintRunnable)
    val view = hint ?: return
    if (!hintAttached) return
    try {
      windowManager.removeViewImmediate(view)
    } catch (_: Exception) {
    }
    hintAttached = false
  }

  override fun onOrbDragStart() {
    snapAnimator?.cancel()
    dragActive = true
    tucked = false
    showTarget()
  }

  override fun onOrbDragCancel() {
    dragActive = false
    removeTarget()
    placeOrb()
  }

  /** Idle: a bubble that tucks slides half off the screen; the handle only fades. */
  override fun onOrbIdle() {
    val view = orb ?: return
    val params = orbParams ?: return
    if (!orbAttached || dragActive || tucked || look.style != OrbStyle.BUBBLE || !look.tuckWhenIdle) return
    val edge = prefs.placement.edge
    val endX = FloatingOrbLookRules.tuckedX(edge, bounds(), orbWidth(), dp(orbMetrics().margin))
    tucked = true
    animateX(view, params, endX)
  }

  override fun onOrbFullscreenChanged(fullscreen: Boolean) {
    val view = orb ?: return
    val params = orbParams ?: return
    if (!orbAttached) return
    val hide = fullscreen && look.hideInFullscreen
    if (hide == fullscreenHidden) return
    fullscreenHidden = hide
    Log.i(TAG, if (hide) "Full screen: stepping aside" else "Full screen ended: back")
    if (hide) removeTarget()
    setTouchable(params, !hide)
    updateLayout(view, params)
  }

  private fun animateX(view: View, params: WindowManager.LayoutParams, endX: Int) {
    snapAnimator?.cancel()
    if (!animationsOn()) {
      params.x = endX
      updateLayout(view, params)
      return
    }
    snapAnimator = ValueAnimator.ofInt(params.x, endX).apply {
      duration = SNAP_MS
      interpolator = DecelerateInterpolator()
      addUpdateListener { animator ->
        if (!orbAttached) return@addUpdateListener
        params.x = animator.animatedValue as Int
        updateLayout(view, params)
      }
      start()
    }
  }

  override fun onOrbDrag(rawX: Float, rawY: Float, grabX: Float, grabY: Float) {
    val view = orb ?: return
    val params = orbParams ?: return
    val bounds = bounds()
    params.x = FloatingOrbRules.clampX((rawX - grabX).toInt(), bounds)
    params.y = FloatingOrbRules.clampY((rawY - grabY).toInt(), bounds)
    updateLayout(view, params)
    target?.active = overTarget(params)
  }

  override fun onOrbDragEnd(rawX: Float, rawY: Float, grabX: Float, grabY: Float) {
    dragActive = false
    val view = orb ?: return
    val params = orbParams ?: return
    val dropped = targetAttached && overTarget(params)
    removeTarget()
    if (dropped) {
      hideUntilAppOpen(showToast = true)
      return
    }
    val bounds = bounds()
    val screenWidth = windowManager.currentWindowMetrics.bounds.width()
    val placement = FloatingOrbRules.placementAfterRelease(params.x, params.y, orbWidth(), screenWidth, bounds)
    prefs.placement = placement
    view.setEdge(placement.edge)
    val (endX, endY) = FloatingOrbRules.positionFor(placement, bounds)
    params.y = endY
    animateX(view, params, endX)
  }

  override fun onOrbAccessibilityMove(edge: OrbEdge) {
    prefs.placement = prefs.placement.copy(edge = edge)
    placeOrb()
  }

  override fun onOrbAccessibilityHide() {
    hideUntilAppOpen(showToast = true)
  }

  private fun animationsOn(): Boolean =
      Settings.Global.getFloat(contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) > 0f

  private fun overTarget(params: WindowManager.LayoutParams): Boolean {
    return FloatingOrbRules.isOverDismissTarget(
        params.x + orbWidth() / 2f,
        params.y + orbHeight() / 2f,
        targetCenter.first,
        targetCenter.second,
        64 * resources.displayMetrics.density)
  }

  private fun showTarget() {
    if (targetAttached || !Settings.canDrawOverlays(this)) return
    val density = resources.displayMetrics.density
    val size = (80 * density).toInt()
    val metrics = windowManager.currentWindowMetrics
    val insets = metrics.windowInsets.getInsetsIgnoringVisibility(WindowInsets.Type.systemBars())
    val params = overlayParams(size, touchable = false).apply {
      x = (metrics.bounds.width() - size) / 2
      y = metrics.bounds.height() - insets.bottom - size - (24 * density).toInt()
    }
    targetCenter = (params.x + size / 2f) to (params.y + size / 2f)
    val view = target ?: FloatingDismissTargetView(this).also { target = it }
    view.active = false
    try {
      windowManager.addView(view, params)
      targetAttached = true
    } catch (e: Exception) {
      Log.w(TAG, "Could not show the Hide target: ${e.javaClass.simpleName}")
    }
  }

  private fun removeTarget() {
    val view = target ?: return
    if (!targetAttached) return
    try {
      windowManager.removeViewImmediate(view)
    } catch (e: Exception) {
      Log.w(TAG, "Could not remove the Hide target: ${e.javaClass.simpleName}")
    }
    targetAttached = false
  }

  // ---- Stop ---------------------------------------------------------------

  /** Hide (drag target, accessibility or the notification): gone until LAFINA is opened. */
  private fun hideUntilAppOpen(showToast: Boolean) {
    prefs.hiddenUntilAppOpen = true
    if (showToast) {
      Toast.makeText(this, "Floating LAFINA hidden. It returns when you open LAFINA.", Toast.LENGTH_SHORT).show()
    }
    shutDown()
  }

  private fun shutDown() {
    Log.i(TAG, "Stopping")
    shuttingDown = true
    handler.removeCallbacks(showRunnable)
    removeOrb()
    try {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } catch (_: Exception) {
    }
    stopSelf()
  }

  /** `adb shell dumpsys activity service <pkg>/.LafinaFloatingAssistantService`: state only, no content. */
  override fun dump(fd: FileDescriptor?, writer: PrintWriter, args: Array<out String>?) {
    writer.println("LafinaFloatingAssistantService")
    writer.println("  orbAttached=$orbAttached targetAttached=$targetAttached shuttingDown=$shuttingDown")
    writer.println("  enabled=${prefs.enabled} hiddenUntilAppOpen=${prefs.hiddenUntilAppOpen} placement=${prefs.placement}")
    writer.println("  look=$look tucked=$tucked fullscreenHidden=$fullscreenHidden")
    writer.println("  canDrawOverlays=${Settings.canDrawOverlays(this)} screenUsable=${screenUsable()}")
    writer.println("  anyActivityResumed=${FloatingAssistantVisibility.anyActivityResumed} mainResumed=${FloatingAssistantVisibility.mainResumed}")
    writer.println("  displayListening=$displayListening opsWatching=$opsWatching")
    writer.println("  quickChatOpen=${QuickChatActivity.isOpen} launchBlockedSeen=${prefs.launchBlockedSeen} hintAttached=$hintAttached")
  }

  override fun onDestroy() {
    shuttingDown = true
    handler.removeCallbacksAndMessages(null)
    removeOrb()
    FloatingAssistantVisibility.setListener(null)
    if (displayListening) {
      runCatching { getSystemService(DisplayManager::class.java).unregisterDisplayListener(displayListener) }
      displayListening = false
    }
    if (opsWatching) {
      runCatching { getSystemService(AppOpsManager::class.java).stopWatchingMode(opsListener) }
      opsWatching = false
    }
    if (instance === this) instance = null
    super.onDestroy()
  }
}
