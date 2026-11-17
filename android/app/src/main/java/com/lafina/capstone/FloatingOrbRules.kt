package com.lafina.capstone

import kotlin.math.hypot
import kotlin.math.roundToInt

/** Which screen edge the Floating LAFINA orb rests on. */
enum class OrbEdge {
  LEFT,
  RIGHT;

  companion object {
    fun parse(value: String?): OrbEdge = if (value == LEFT.name) LEFT else RIGHT
  }
}

/** Where the orb rests: an edge plus 0..1 down the usable height (survives rotation). */
data class OrbPlacement(val edge: OrbEdge, val fraction: Float) {
  companion object {
    /** Right edge, 35% down the usable area (`03` §3.2). */
    val DEFAULT = OrbPlacement(OrbEdge.RIGHT, 0.35f)
  }
}

/**
 * The area the orb window's top-left corner may occupy, in pixels.
 * Built from the screen size, the system-bar/cutout insets, the window size
 * and the edge margin, so a placed orb never sits under a system bar.
 */
data class OrbBounds(val minX: Int, val maxX: Int, val minY: Int, val maxY: Int) {
  companion object {
    fun from(
        screenWidth: Int,
        screenHeight: Int,
        insetLeft: Int,
        insetTop: Int,
        insetRight: Int,
        insetBottom: Int,
        windowSize: Int,
        margin: Int,
    ): OrbBounds =
        from(screenWidth, screenHeight, insetLeft, insetTop, insetRight, insetBottom, windowSize, windowSize, margin)

    /** A window that is not square (the edge handle). */
    fun from(
        screenWidth: Int,
        screenHeight: Int,
        insetLeft: Int,
        insetTop: Int,
        insetRight: Int,
        insetBottom: Int,
        windowWidth: Int,
        windowHeight: Int,
        margin: Int,
    ): OrbBounds {
      val minX = insetLeft + margin
      val maxX = (screenWidth - insetRight - margin - windowWidth).coerceAtLeast(minX)
      val minY = insetTop + margin
      val maxY = (screenHeight - insetBottom - margin - windowHeight).coerceAtLeast(minY)
      return OrbBounds(minX, maxX, minY, maxY)
    }
  }
}

/**
 * Floating LAFINA (ADR-036): pure orb geometry and gesture rules, kept free of
 * Android types so they run as JVM unit tests.
 */
object FloatingOrbRules {
  /** Movement under the system touch slop is a tap, not a drag (`03` §3.2). */
  fun isTap(dx: Float, dy: Float, touchSlop: Float): Boolean = hypot(dx, dy) < touchSlop

  fun clampX(x: Int, bounds: OrbBounds): Int = x.coerceIn(bounds.minX, bounds.maxX)

  fun clampY(y: Int, bounds: OrbBounds): Int = y.coerceIn(bounds.minY, bounds.maxY)

  /** The edge nearer to the orb's centre; the exact middle goes right. */
  fun nearestEdge(windowX: Int, windowSize: Int, screenWidth: Int): OrbEdge =
      if (windowX + windowSize / 2f < screenWidth / 2f) OrbEdge.LEFT else OrbEdge.RIGHT

  /** 0 at the top of the usable area, 1 at the bottom. */
  fun fractionFor(y: Int, bounds: OrbBounds): Float {
    val range = bounds.maxY - bounds.minY
    if (range <= 0) return 0f
    return ((clampY(y, bounds) - bounds.minY).toFloat() / range).coerceIn(0f, 1f)
  }

  /** Pixel position for a stored placement in these bounds. */
  fun positionFor(placement: OrbPlacement, bounds: OrbBounds): Pair<Int, Int> {
    val x = if (placement.edge == OrbEdge.LEFT) bounds.minX else bounds.maxX
    val fraction = placement.fraction.takeIf { !it.isNaN() }?.coerceIn(0f, 1f) ?: OrbPlacement.DEFAULT.fraction
    val y = bounds.minY + ((bounds.maxY - bounds.minY) * fraction).roundToInt()
    return x to clampY(y, bounds)
  }

  /** Where a released orb snaps to, and the placement to save. */
  fun placementAfterRelease(windowX: Int, windowY: Int, windowSize: Int, screenWidth: Int, bounds: OrbBounds): OrbPlacement =
      OrbPlacement(nearestEdge(windowX, windowSize, screenWidth), fractionFor(windowY, bounds))

  /**
   * True when the orb's centre is within [hitRadius] of the Hide target's centre.
   * The orb counts as dropped on the target from this distance.
   */
  fun isOverDismissTarget(
      orbCenterX: Float,
      orbCenterY: Float,
      targetCenterX: Float,
      targetCenterY: Float,
      hitRadius: Float,
  ): Boolean = hypot(orbCenterX - targetCenterX, orbCenterY - targetCenterY) <= hitRadius

  /**
   * A position after a rotation, fold or display change: the stored placement
   * re-applied to the new bounds (never the old pixels).
   */
  fun remap(placement: OrbPlacement, newBounds: OrbBounds): Pair<Int, Int> = positionFor(placement, newBounds)
}

/** How the floating button looks: a thin bar on the edge, or the round bubble. */
enum class OrbStyle {
  HANDLE,
  BUBBLE;

  val code: String
    get() = name.lowercase()

  companion object {
    fun parse(value: String?): OrbStyle? = entries.firstOrNull { it.code == value || it.name == value }
  }
}

enum class OrbSize {
  SMALL,
  MEDIUM,
  LARGE;

  val code: String
    get() = name.lowercase()

  companion object {
    fun parse(value: String?): OrbSize? = entries.firstOrNull { it.code == value || it.name == value }
  }
}

/**
 * The student's choices for the floating button (device-local). [color] null
 * means "follow the app's theme colour".
 */
data class OrbLook(
    val style: OrbStyle,
    val size: OrbSize,
    /** Opacity while idle, percent (the button is fully opaque while touched). */
    val idleOpacity: Int,
    val color: Int?,
    /** Bubble only: slide half off the screen while idle. */
    val tuckWhenIdle: Boolean,
    /** Ignore drags, so the button never moves by accident. */
    val lockPosition: Boolean,
    /** Step aside while another app is full screen (status bar hidden). */
    val hideInFullscreen: Boolean,
) {
  companion object {
    const val MIN_OPACITY = 20
    const val MAX_OPACITY = 100
    val DEFAULT = OrbLook(OrbStyle.HANDLE, OrbSize.MEDIUM, 60, null, true, false, true)

    fun clampOpacity(value: Int): Int = value.coerceIn(MIN_OPACITY, MAX_OPACITY)
  }
}

/** Sizes in dp. [mark] is the bar thickness (handle) or the disc diameter (bubble). */
data class OrbMetrics(val windowWidth: Int, val windowHeight: Int, val margin: Int, val mark: Int) {
  companion object {
    /** Touch strip of the handle: wide enough to hit, narrow enough not to get in the way. */
    const val HANDLE_TOUCH_WIDTH = 24

    fun of(style: OrbStyle, size: OrbSize): OrbMetrics =
        when (style) {
          OrbStyle.HANDLE -> {
            val (height, bar) =
                when (size) {
                  OrbSize.SMALL -> 64 to 4
                  OrbSize.MEDIUM -> 88 to 6
                  OrbSize.LARGE -> 112 to 8
                }
            OrbMetrics(HANDLE_TOUCH_WIDTH, height, 0, bar)
          }
          OrbStyle.BUBBLE -> {
            val disc =
                when (size) {
                  OrbSize.SMALL -> 40
                  OrbSize.MEDIUM -> 48
                  OrbSize.LARGE -> 56
                }
            OrbMetrics(disc + 8, disc + 8, 8, disc)
          }
        }
  }
}

/** What a touch on the edge handle meant. */
enum class HandleGesture {
  /** Open Quick Chat. */
  OPEN,
  /** Nothing (a stray touch, or a swipe along or out of the edge). */
  NONE,
}

/** Rules added for the customizable button (owner request 2026-11-18). */
object FloatingOrbLookRules {
  /**
   * The handle opens on a tap or on a swipe inward (away from its edge), the
   * way edge panels open. Other movements are ignored so a brush of the edge
   * never opens anything.
   */
  fun handleGesture(dx: Float, dy: Float, touchSlop: Float, edge: OrbEdge): HandleGesture {
    if (FloatingOrbRules.isTap(dx, dy, touchSlop)) return HandleGesture.OPEN
    val inward = if (edge == OrbEdge.RIGHT) -dx else dx
    return if (inward >= touchSlop && inward > kotlin.math.abs(dy)) HandleGesture.OPEN else HandleGesture.NONE
  }

  /** Window x when the bubble is tucked: half of it past the screen edge. */
  fun tuckedX(edge: OrbEdge, bounds: OrbBounds, windowWidth: Int, margin: Int): Int =
      if (edge == OrbEdge.LEFT) bounds.minX - margin - windowWidth / 2
      else bounds.maxX + margin + windowWidth / 2

  /** Idle opacity as a view alpha. */
  fun idleAlpha(look: OrbLook): Float = OrbLook.clampOpacity(look.idleOpacity) / 100f

  /** True when [argb] is light enough that a white mark on it would be hard to see. */
  fun isLight(argb: Int): Boolean {
    val r = (argb shr 16) and 0xFF
    val g = (argb shr 8) and 0xFF
    val b = argb and 0xFF
    return (0.299 * r + 0.587 * g + 0.114 * b) > 170
  }
}
