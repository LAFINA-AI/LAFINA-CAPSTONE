package com.lafina.capstone

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapShader
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Shader
import android.os.Handler
import android.os.Looper
import android.view.PixelCopy
import android.view.View
import android.view.ViewGroup
import android.view.animation.PathInterpolator
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import kotlin.math.hypot
import kotlin.math.max

/**
 * Circular reveal for theme changes.
 */
class LafinaThemeRevealModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private val main = Handler(Looper.getMainLooper())
  private var overlay: RevealOverlay? = null

  override fun getName(): String = "LafinaThemeReveal"

  @ReactMethod
  fun capture(x: Double, y: Double, promise: Promise) {
    val activity = reactContext.currentActivity
    if (activity == null) {
      promise.resolve(false)
      return
    }
    main.post {
      try {
        val window = activity.window
        val decor = window.decorView as? ViewGroup
        if (decor == null || decor.width <= 0 || decor.height <= 0) {
          promise.resolve(false)
          return@post
        }
        val density = decor.resources.displayMetrics.density
        val content = IntArray(2)
        activity.findViewById<View>(android.R.id.content)?.getLocationInWindow(content)
        val cx = if (x >= 0) content[0] + (x * density).toFloat() else decor.width / 2f
        val cy = if (y >= 0) content[1] + (y * density).toFloat() else decor.height / 2f

        val snapshot = Bitmap.createBitmap(decor.width, decor.height, Bitmap.Config.ARGB_8888)
        PixelCopy.request(window, snapshot, { result ->
          if (result != PixelCopy.SUCCESS || !decor.isAttachedToWindow) {
            promise.resolve(false)
            return@request
          }
          val previous = overlay
          val next = RevealOverlay(activity, snapshot, cx, cy)
          decor.addView(
            next,
            ViewGroup.LayoutParams(
              ViewGroup.LayoutParams.MATCH_PARENT,
              ViewGroup.LayoutParams.MATCH_PARENT,
            ),
          )
          previous?.remove()
          overlay = next
          next.postDelayed({ next.reveal { if (overlay === next) overlay = null } }, SAFETY_MS)
          promise.resolve(true)
        }, main)
      } catch (error: Exception) {
        promise.resolve(false)
      }
    }
  }

  @ReactMethod
  fun reveal(promise: Promise) {
    main.post {
      val current = overlay
      if (current == null) {
        promise.resolve(false)
        return@post
      }
      current.reveal { if (overlay === current) overlay = null }
      promise.resolve(true)
    }
  }

  @SuppressLint("ViewConstructor")
  private class RevealOverlay(
    context: Context,
    private val snapshot: Bitmap,
    private val cx: Float,
    private val cy: Float,
  ) : View(context) {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      shader = BitmapShader(snapshot, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP)
    }
    private val path = Path()
    private var radius = 0f
    private var started = false
    private var animator: ValueAnimator? = null

    init {
      isClickable = true
      importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
    }

    override fun onDraw(canvas: Canvas) {
      if (radius <= 0f) {
        canvas.drawBitmap(snapshot, 0f, 0f, null)
        return
      }
      path.rewind()
      path.fillType = Path.FillType.EVEN_ODD
      path.addRect(0f, 0f, width.toFloat(), height.toFloat(), Path.Direction.CW)
      path.addCircle(cx, cy, radius, Path.Direction.CW)
      canvas.drawPath(path, paint)
    }

    fun reveal(onDone: () -> Unit) {
      if (started) return
      started = true
      postOnAnimation {
        postOnAnimation {
          if (!isAttachedToWindow) {
            onDone()
            return@postOnAnimation
          }
          val maxRadius = hypot(max(cx, width - cx), max(cy, height - cy))
          animator = ValueAnimator.ofFloat(0f, maxRadius).apply {
            duration = DURATION_MS
            interpolator = PathInterpolator(0.4f, 0f, 0.2f, 1f)
            addUpdateListener {
              radius = it.animatedValue as Float
              invalidate()
            }
            addListener(object : AnimatorListenerAdapter() {
              override fun onAnimationEnd(animation: Animator) {
                remove()
                onDone()
              }
            })
            start()
          }
        }
      }
    }

    fun remove() {
      animator?.removeAllListeners()
      animator?.cancel()
      (parent as? ViewGroup)?.removeView(this)
    }
  }

  companion object {
    private const val DURATION_MS = 500L
    private const val SAFETY_MS = 1500L
  }
}
