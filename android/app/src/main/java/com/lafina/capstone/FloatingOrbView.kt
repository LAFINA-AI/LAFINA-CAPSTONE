package com.lafina.capstone

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.os.Bundle
import android.provider.Settings
import android.view.HapticFeedbackConstants
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.WindowInsets
import android.view.accessibility.AccessibilityNodeInfo
import kotlin.math.min

/**
 * Floating LAFINA (ADR-036): the floating button, drawn in code. Two looks
 * (owner request 2026-11-18):
 * - [OrbStyle.HANDLE]: a thin rounded bar flush against the screen edge, like
 *   an edge-panel handle. Tap or swipe inward opens Quick Chat; long-press,
 *   then drag, moves it.
 * - [OrbStyle.BUBBLE]: the round button with the LAFINA "L" mark; can tuck
 *   half off the screen while idle.
 * Reports touches to [Listener]; it never moves its own window. The only
 * timers are the one-shot idle fade and the handle's long-press.
 */
@SuppressLint("ViewConstructor")
class FloatingOrbView(context: Context, private val listener: Listener) : View(context) {
  interface Listener {
    fun onOrbTap()
    fun onOrbDragStart()
    /** Raw screen coordinates of the finger and the offset to the window's top-left. */
    fun onOrbDrag(rawX: Float, rawY: Float, grabX: Float, grabY: Float)
    fun onOrbDragEnd(rawX: Float, rawY: Float, grabX: Float, grabY: Float)
    /** The system took the gesture (for example the Back swipe): put the button back. */
    fun onOrbDragCancel()
    /** No touch for a while: fade (and tuck, for a bubble that tucks). */
    fun onOrbIdle()
    /** Whether another app has hidden the status bar (full screen). Nothing else is read. */
    fun onOrbFullscreenChanged(fullscreen: Boolean)
    fun onOrbAccessibilityMove(edge: OrbEdge)
    fun onOrbAccessibilityHide()
  }

  private val density = resources.displayMetrics.density
  private val touchSlop = ViewConfiguration.get(context).scaledTouchSlop.toFloat()
  private val longPressMs = ViewConfiguration.getLongPressTimeout().toLong()
  private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
  private val ring = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    style = Paint.Style.STROKE
    strokeWidth = 2f * density
  }
  private val glyph = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
  private val glyphPath = Path()
  private val bar = RectF()
  private var look = OrbLook.DEFAULT
  private var edge = OrbEdge.RIGHT
  private var downRawX = 0f
  private var downRawY = 0f
  private var grabX = 0f
  private var grabY = 0f
  private var dragging = false
  private var moved = false
  private var lastFullscreen: Boolean? = null
  private val fadeRunnable = Runnable { goIdle() }
  private val longPressRunnable = Runnable { startDrag(haptic = true) }

  init {
    contentDescription = "LAFINA Quick Chat. Double tap to open."
    isClickable = true
    isFocusable = false
    importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_YES
    setColor(FloatingAssistantPrefs.DEFAULT_COLOR)
    setOnApplyWindowInsetsListener { _, insets ->
      // Only the status bar's visibility: hidden while an app is full screen.
      val fullscreen = !insets.isVisible(WindowInsets.Type.statusBars())
      if (fullscreen != lastFullscreen) {
        lastFullscreen = fullscreen
        listener.onOrbFullscreenChanged(fullscreen)
      }
      insets
    }
  }

  fun configure(look: OrbLook, edge: OrbEdge, argb: Int) {
    this.look = look
    this.edge = edge
    setColor(argb)
  }

  fun setEdge(value: OrbEdge) {
    if (edge == value) return
    edge = value
    invalidate()
  }

  fun setColor(argb: Int) {
    val opaque = argb or 0xFF000000.toInt()
    fill.color = opaque
    val light = FloatingOrbLookRules.isLight(opaque)
    // A light button gets a dark outline and mark so it stays visible on light screens.
    // The edge bar's outline is faint: just enough to separate it from the app behind.
    val handle = look.style == OrbStyle.HANDLE
    ring.color = when {
      light -> Color.argb(if (handle) 90 else 110, 0, 0, 0)
      handle -> Color.argb(110, 255, 255, 255)
      else -> Color.argb(230, 255, 255, 255)
    }
    glyph.color = if (light) Color.argb(220, 32, 33, 36) else Color.WHITE
    if (look.style == OrbStyle.BUBBLE) {
      fill.setShadowLayer(4f * density, 0f, 2f * density, Color.argb(90, 0, 0, 0))
    } else {
      fill.clearShadowLayer()
    }
    invalidate()
  }

  /** Full opacity now, then the idle look after a few seconds without touch. */
  fun wake() {
    removeCallbacks(fadeRunnable)
    animate().cancel()
    alpha = 1f
    postDelayed(fadeRunnable, IDLE_FADE_MS)
  }

  fun sleep() {
    removeCallbacks(fadeRunnable)
    removeCallbacks(longPressRunnable)
    animate().cancel()
  }

  private var cachedAnimationsOn: Boolean = readAnimationsOn()

  private fun readAnimationsOn(): Boolean = try {
    Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) > 0f
  } catch (_: Exception) {
    true
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    cachedAnimationsOn = readAnimationsOn()
  }

  override fun onWindowFocusChanged(hasWindowFocus: Boolean) {
    super.onWindowFocusChanged(hasWindowFocus)
    if (hasWindowFocus) cachedAnimationsOn = readAnimationsOn()
  }

  private fun animationsOn(): Boolean = cachedAnimationsOn

  private fun goIdle() {
    val target = FloatingOrbLookRules.idleAlpha(look)
    if (animationsOn()) animate().alpha(target).setDuration(300).start() else alpha = target
    listener.onOrbIdle()
  }

  private fun setPressedScale(scale: Float) {
    if (!animationsOn() || look.style != OrbStyle.BUBBLE) return
    scaleX = scale
    scaleY = scale
  }

  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)
    if (look.style == OrbStyle.HANDLE) drawHandle(canvas) else drawBubble(canvas)
  }

  /** A rounded bar 2 dp in from the screen edge, the window height less 4 dp at each end. */
  private fun drawHandle(canvas: Canvas) {
    val thickness = OrbMetrics.of(look.style, look.size).mark * density
    val inset = 2f * density
    val left = if (edge == OrbEdge.RIGHT) width - inset - thickness else inset
    bar.set(left, 4f * density, left + thickness, height - 4f * density)
    val radius = thickness / 2f
    canvas.drawRoundRect(bar, radius, radius, fill)
    ring.strokeWidth = 1f * density
    canvas.drawRoundRect(bar, radius, radius, ring)
  }

  private fun drawBubble(canvas: Canvas) {
    val cx = width / 2f
    val cy = height / 2f
    val radius = min(width, height) / 2f - 4f * density
    canvas.drawCircle(cx, cy, radius, fill)
    ring.strokeWidth = 2f * density
    canvas.drawCircle(cx, cy, radius - ring.strokeWidth / 2f, ring)
    // The launcher's "L" (res/drawable/ic_launcher.xml, 108-unit viewport:
    // M34,27 h12 v42 h28 v12 h-40 z), scaled to the disc.
    val unit = radius / 54f
    val left = cx - 20f * unit
    val top = cy - 27f * unit
    glyphPath.reset()
    glyphPath.moveTo(left, top)
    glyphPath.rLineTo(12f * unit, 0f)
    glyphPath.rLineTo(0f, 42f * unit)
    glyphPath.rLineTo(28f * unit, 0f)
    glyphPath.rLineTo(0f, 12f * unit)
    glyphPath.rLineTo(-40f * unit, 0f)
    glyphPath.close()
    canvas.drawPath(glyphPath, glyph)
  }

  private fun startDrag(haptic: Boolean) {
    if (dragging || look.lockPosition) return
    dragging = true
    if (haptic) performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
    setPressedScale(1.06f)
    listener.onOrbDragStart()
  }

  @SuppressLint("ClickableViewAccessibility")
  override fun onTouchEvent(event: MotionEvent): Boolean {
    when (event.actionMasked) {
      MotionEvent.ACTION_DOWN -> {
        removeCallbacks(fadeRunnable)
        animate().cancel()
        alpha = 1f
        setPressedScale(0.94f)
        downRawX = event.rawX
        downRawY = event.rawY
        grabX = event.x
        grabY = event.y
        dragging = false
        moved = false
        // The handle moves only after a long press, so a brush of the edge never drags it.
        if (look.style == OrbStyle.HANDLE && !look.lockPosition) postDelayed(longPressRunnable, longPressMs)
      }
      MotionEvent.ACTION_MOVE -> {
        val dx = event.rawX - downRawX
        val dy = event.rawY - downRawY
        if (!moved && !FloatingOrbRules.isTap(dx, dy, touchSlop)) {
          moved = true
          if (!dragging) removeCallbacks(longPressRunnable)
          if (look.style == OrbStyle.BUBBLE) startDrag(haptic = false)
        }
        if (dragging) listener.onOrbDrag(event.rawX, event.rawY, grabX, grabY)
      }
      MotionEvent.ACTION_UP -> {
        removeCallbacks(longPressRunnable)
        setPressedScale(1f)
        val dx = event.rawX - downRawX
        val dy = event.rawY - downRawY
        when {
          dragging -> {
            dragging = false
            listener.onOrbDragEnd(event.rawX, event.rawY, grabX, grabY)
          }
          look.style == OrbStyle.HANDLE -> {
            if (FloatingOrbLookRules.handleGesture(dx, dy, touchSlop, edge) == HandleGesture.OPEN) {
              listener.onOrbTap()
            }
          }
          !moved -> listener.onOrbTap()
        }
        postDelayed(fadeRunnable, IDLE_FADE_MS)
      }
      MotionEvent.ACTION_CANCEL -> {
        removeCallbacks(longPressRunnable)
        setPressedScale(1f)
        if (dragging) {
          dragging = false
          listener.onOrbDragCancel()
        }
        postDelayed(fadeRunnable, IDLE_FADE_MS)
      }
    }
    return true
  }

  override fun performClick(): Boolean {
    super.performClick()
    listener.onOrbTap()
    return true
  }

  override fun onInitializeAccessibilityNodeInfo(info: AccessibilityNodeInfo) {
    super.onInitializeAccessibilityNodeInfo(info)
    info.className = "android.widget.Button"
    info.addAction(AccessibilityNodeInfo.AccessibilityAction(ACTION_MOVE_LEFT, "Move to left edge"))
    info.addAction(AccessibilityNodeInfo.AccessibilityAction(ACTION_MOVE_RIGHT, "Move to right edge"))
    info.addAction(AccessibilityNodeInfo.AccessibilityAction(ACTION_HIDE, "Hide"))
  }

  override fun performAccessibilityAction(action: Int, arguments: Bundle?): Boolean =
      when (action) {
        ACTION_MOVE_LEFT -> {
          listener.onOrbAccessibilityMove(OrbEdge.LEFT)
          true
        }
        ACTION_MOVE_RIGHT -> {
          listener.onOrbAccessibilityMove(OrbEdge.RIGHT)
          true
        }
        ACTION_HIDE -> {
          listener.onOrbAccessibilityHide()
          true
        }
        else -> super.performAccessibilityAction(action, arguments)
      }

  override fun onDetachedFromWindow() {
    sleep()
    lastFullscreen = null
    super.onDetachedFromWindow()
  }

  companion object {
    const val IDLE_FADE_MS = 3_000L
    // Custom action ids above the framework's bit-flag actions and outside android.R.id.
    private const val ACTION_MOVE_LEFT = 0x00F10001
    private const val ACTION_MOVE_RIGHT = 0x00F10002
    private const val ACTION_HIDE = 0x00F10003
  }
}

/** The Hide target shown at the bottom centre while the orb is dragged. */
@SuppressLint("ViewConstructor")
class FloatingDismissTargetView(context: Context) : View(context) {
  private val density = resources.displayMetrics.density
  private val disc = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    style = Paint.Style.FILL
    color = Color.argb(200, 30, 30, 30)
  }
  private val cross = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    style = Paint.Style.STROKE
    strokeWidth = 3f * density
    strokeCap = Paint.Cap.ROUND
    color = Color.WHITE
  }
  var active = false
    set(value) {
      if (field == value) return
      field = value
      disc.color = if (value) Color.argb(230, 184, 0, 46) else Color.argb(200, 30, 30, 30)
      invalidate()
    }

  init {
    importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO
  }

  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)
    val cx = width / 2f
    val cy = height / 2f
    val radius = min(width, height) / 2f * (if (active) 1f else 0.85f)
    canvas.drawCircle(cx, cy, radius, disc)
    val arm = 9f * density
    canvas.drawLine(cx - arm, cy - arm, cx + arm, cy + arm, cross)
    canvas.drawLine(cx - arm, cy + arm, cx + arm, cy - arm, cross)
  }
}
