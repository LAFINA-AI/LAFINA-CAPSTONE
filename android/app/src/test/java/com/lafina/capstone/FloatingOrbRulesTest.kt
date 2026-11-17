package com.lafina.capstone

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Floating LAFINA FLOAT-02 (K-01): orb geometry and gestures on the JVM. */
class FloatingOrbRulesTest {
  // A 1080 × 2400 portrait phone: 80 px status bar, 60 px nav bar, 176 px window, 22 px margin.
  private val portrait = OrbBounds.from(1080, 2400, 0, 80, 0, 60, 176, 22)
  private val landscape = OrbBounds.from(2400, 1080, 0, 80, 120, 0, 176, 22)

  @Test
  fun boundsKeepTheWindowInsideTheSafeArea() {
    assertEquals(22, portrait.minX)
    assertEquals(1080 - 22 - 176, portrait.maxX)
    assertEquals(80 + 22, portrait.minY)
    assertEquals(2400 - 60 - 22 - 176, portrait.maxY)
    // A nav bar on the right in landscape narrows the right side.
    assertEquals(2400 - 120 - 22 - 176, landscape.maxX)
  }

  @Test
  fun boundsNeverInvertOnATinyScreen() {
    val tiny = OrbBounds.from(100, 100, 0, 40, 0, 40, 176, 22)
    assertTrue(tiny.maxX >= tiny.minX)
    assertTrue(tiny.maxY >= tiny.minY)
  }

  @Test
  fun tapVersusDrag() {
    assertTrue(FloatingOrbRules.isTap(0f, 0f, 24f))
    assertTrue(FloatingOrbRules.isTap(10f, 10f, 24f))
    assertFalse(FloatingOrbRules.isTap(24f, 0f, 24f))
    assertFalse(FloatingOrbRules.isTap(-20f, 20f, 24f))
  }

  @Test
  fun clampKeepsDraggedPositionsInBounds() {
    assertEquals(portrait.minX, FloatingOrbRules.clampX(-500, portrait))
    assertEquals(portrait.maxX, FloatingOrbRules.clampX(5000, portrait))
    assertEquals(400, FloatingOrbRules.clampX(400, portrait))
    assertEquals(portrait.minY, FloatingOrbRules.clampY(0, portrait))
    assertEquals(portrait.maxY, FloatingOrbRules.clampY(9999, portrait))
  }

  @Test
  fun nearestEdgeUsesTheOrbCentre() {
    assertEquals(OrbEdge.LEFT, FloatingOrbRules.nearestEdge(100, 176, 1080))
    assertEquals(OrbEdge.RIGHT, FloatingOrbRules.nearestEdge(800, 176, 1080))
    // Centre exactly in the middle: right.
    assertEquals(OrbEdge.RIGHT, FloatingOrbRules.nearestEdge(540 - 88, 176, 1080))
    assertEquals(OrbEdge.LEFT, FloatingOrbRules.nearestEdge(540 - 89, 176, 1080))
  }

  @Test
  fun fractionAndPositionRoundTrip() {
    for (fraction in listOf(0f, 0.25f, 0.35f, 0.5f, 1f)) {
      val (x, y) = FloatingOrbRules.positionFor(OrbPlacement(OrbEdge.LEFT, fraction), portrait)
      assertEquals(portrait.minX, x)
      assertEquals(fraction, FloatingOrbRules.fractionFor(y, portrait), 0.001f)
    }
    val (rightX, _) = FloatingOrbRules.positionFor(OrbPlacement.DEFAULT, portrait)
    assertEquals(portrait.maxX, rightX)
  }

  @Test
  fun outOfRangeOrInvalidFractionsAreSafe() {
    assertEquals(portrait.minY, FloatingOrbRules.positionFor(OrbPlacement(OrbEdge.RIGHT, -3f), portrait).second)
    assertEquals(portrait.maxY, FloatingOrbRules.positionFor(OrbPlacement(OrbEdge.RIGHT, 7f), portrait).second)
    val nan = FloatingOrbRules.positionFor(OrbPlacement(OrbEdge.RIGHT, Float.NaN), portrait)
    assertEquals(FloatingOrbRules.positionFor(OrbPlacement.DEFAULT, portrait), nan)
    val flat = OrbBounds(10, 10, 50, 50)
    assertEquals(0f, FloatingOrbRules.fractionFor(50, flat), 0f)
  }

  @Test
  fun releaseSnapsToTheNearestEdgeAndKeepsTheHeight() {
    val placement = FloatingOrbRules.placementAfterRelease(300, 1200, 176, 1080, portrait)
    assertEquals(OrbEdge.LEFT, placement.edge)
    assertEquals(FloatingOrbRules.fractionFor(1200, portrait), placement.fraction, 0f)
    val above = FloatingOrbRules.placementAfterRelease(900, -400, 176, 1080, portrait)
    assertEquals(OrbEdge.RIGHT, above.edge)
    assertEquals(0f, above.fraction, 0f)
  }

  @Test
  fun dismissHitTest() {
    assertTrue(FloatingOrbRules.isOverDismissTarget(540f, 2200f, 540f, 2200f, 120f))
    assertTrue(FloatingOrbRules.isOverDismissTarget(540f + 120f, 2200f, 540f, 2200f, 120f))
    assertFalse(FloatingOrbRules.isOverDismissTarget(540f + 100f, 2200f - 100f, 540f, 2200f, 120f))
    assertFalse(FloatingOrbRules.isOverDismissTarget(100f, 300f, 540f, 2200f, 120f))
  }

  @Test
  fun rotationReappliesEdgeAndFraction() {
    val placement = OrbPlacement(OrbEdge.RIGHT, 0.5f)
    val (x, y) = FloatingOrbRules.remap(placement, landscape)
    assertEquals(landscape.maxX, x)
    assertEquals(0.5f, FloatingOrbRules.fractionFor(y, landscape), 0.01f)
    // And back to portrait: the same place as before rotation.
    assertEquals(FloatingOrbRules.positionFor(placement, portrait), FloatingOrbRules.remap(placement, portrait))
  }

  @Test
  fun edgeParsingDefaultsToRight() {
    assertEquals(OrbEdge.LEFT, OrbEdge.parse("LEFT"))
    assertEquals(OrbEdge.RIGHT, OrbEdge.parse("RIGHT"))
    assertEquals(OrbEdge.RIGHT, OrbEdge.parse(null))
    assertEquals(OrbEdge.RIGHT, OrbEdge.parse("sideways"))
  }

  // ---- Customizable button (owner request 2026-11-18) ----

  @Test
  fun defaultLookIsTheQuietEdgeHandle() {
    val look = OrbLook.DEFAULT
    assertEquals(OrbStyle.HANDLE, look.style)
    assertEquals(OrbSize.MEDIUM, look.size)
    assertTrue(look.idleOpacity < 100)
    assertEquals(null, look.color)
    assertFalse(look.lockPosition)
    assertTrue(look.hideInFullscreen)
  }

  @Test
  fun handleIsANarrowStripFlushWithTheEdge() {
    for (size in OrbSize.entries) {
      val m = OrbMetrics.of(OrbStyle.HANDLE, size)
      assertEquals(0, m.margin)
      assertEquals(OrbMetrics.HANDLE_TOUCH_WIDTH, m.windowWidth)
      assertTrue(m.windowHeight > m.windowWidth)
      assertTrue(m.mark < m.windowWidth)
    }
    // Sizes grow in order.
    assertTrue(OrbMetrics.of(OrbStyle.HANDLE, OrbSize.SMALL).windowHeight < OrbMetrics.of(OrbStyle.HANDLE, OrbSize.LARGE).windowHeight)
    // Flush: a right-edge handle's window ends exactly at the screen edge (no nav bar on the side).
    val m = OrbMetrics.of(OrbStyle.HANDLE, OrbSize.MEDIUM)
    val bounds = OrbBounds.from(1080, 2400, 0, 80, 0, 60, m.windowWidth * 3, m.windowHeight * 3, 0)
    val (x, _) = FloatingOrbRules.positionFor(OrbPlacement(OrbEdge.RIGHT, 0.5f), bounds)
    assertEquals(1080 - m.windowWidth * 3, x)
    assertEquals(0, FloatingOrbRules.positionFor(OrbPlacement(OrbEdge.LEFT, 0.5f), bounds).first)
  }

  @Test
  fun bubbleSizesAreAllSmallerThanOrEqualToTheOldOrb() {
    for (size in OrbSize.entries) {
      val m = OrbMetrics.of(OrbStyle.BUBBLE, size)
      assertEquals(m.windowWidth, m.windowHeight)
      assertTrue(m.mark <= 56)
      assertEquals(m.mark + 8, m.windowWidth)
    }
  }

  @Test
  fun nonSquareBoundsUseWidthAndHeightSeparately() {
    val b = OrbBounds.from(1080, 2400, 0, 80, 0, 60, 72, 264, 0)
    assertEquals(0, b.minX)
    assertEquals(1080 - 72, b.maxX)
    assertEquals(80, b.minY)
    assertEquals(2400 - 60 - 264, b.maxY)
  }

  @Test
  fun handleOpensOnTapOrInwardSwipeOnly() {
    val slop = 24f
    // Tap.
    assertEquals(HandleGesture.OPEN, FloatingOrbLookRules.handleGesture(3f, -4f, slop, OrbEdge.RIGHT))
    // Right edge: inward is to the left.
    assertEquals(HandleGesture.OPEN, FloatingOrbLookRules.handleGesture(-80f, 10f, slop, OrbEdge.RIGHT))
    assertEquals(HandleGesture.NONE, FloatingOrbLookRules.handleGesture(80f, 0f, slop, OrbEdge.RIGHT))
    // Left edge: inward is to the right.
    assertEquals(HandleGesture.OPEN, FloatingOrbLookRules.handleGesture(80f, -10f, slop, OrbEdge.LEFT))
    assertEquals(HandleGesture.NONE, FloatingOrbLookRules.handleGesture(-80f, 0f, slop, OrbEdge.LEFT))
    // A slide along the edge (mostly vertical) never opens.
    assertEquals(HandleGesture.NONE, FloatingOrbLookRules.handleGesture(-30f, 120f, slop, OrbEdge.RIGHT))
  }

  @Test
  fun tuckedBubbleIsHalfPastItsEdge() {
    val window = 136
    val margin = 22
    val b = OrbBounds.from(1080, 2400, 0, 80, 0, 60, window, margin)
    assertEquals(-window / 2, FloatingOrbLookRules.tuckedX(OrbEdge.LEFT, b, window, margin))
    assertEquals(1080 - window / 2, FloatingOrbLookRules.tuckedX(OrbEdge.RIGHT, b, window, margin))
  }

  @Test
  fun opacityIsClampedAndLightColoursAreDetected() {
    assertEquals(OrbLook.MIN_OPACITY, OrbLook.clampOpacity(0))
    assertEquals(100, OrbLook.clampOpacity(500))
    assertEquals(0.6f, FloatingOrbLookRules.idleAlpha(OrbLook.DEFAULT.copy(idleOpacity = 60)), 0.0001f)
    assertTrue(FloatingOrbLookRules.isLight(0xFFFFFFFF.toInt()))
    assertTrue(FloatingOrbLookRules.isLight(0xFFE0E0E0.toInt()))
    assertFalse(FloatingOrbLookRules.isLight(0xFFB8002E.toInt()))
    assertFalse(FloatingOrbLookRules.isLight(0xFF1E88E5.toInt()))
  }

  @Test
  fun styleAndSizeParseCodesAndRejectOthers() {
    assertEquals(OrbStyle.BUBBLE, OrbStyle.parse("bubble"))
    assertEquals(OrbStyle.HANDLE, OrbStyle.parse("handle"))
    assertEquals(null, OrbStyle.parse("square"))
    assertEquals(OrbSize.LARGE, OrbSize.parse("large"))
    assertEquals(null, OrbSize.parse(null))
  }
}
