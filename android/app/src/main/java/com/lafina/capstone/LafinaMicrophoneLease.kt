package com.lafina.capstone

/**
 * Process-wide microphone ownership for LAFINA native audio modules.
 *
 * Android permits only one active AudioRecord stream per process on many OEM
 * HALs; starting push-to-talk capture while a meeting is being recorded (or vice
 * versa) can silently starve one of the streams. Modules acquire a named lease
 * before opening AudioRecord and release it on stop.
 */
object LafinaMicrophoneLease {
    enum class Holder {
        SPEECH_TO_TEXT,
        MEETING_RECORDER,
    }

    @Volatile
    private var currentHolder: Holder? = null

    @Synchronized
    fun tryAcquire(holder: Holder): Boolean {
        val active = currentHolder
        if (active != null && active != holder) {
            return false
        }
        currentHolder = holder
        return true
    }

    @Synchronized
    fun release(holder: Holder) {
        if (currentHolder == holder) {
            currentHolder = null
        }
    }

    fun activeHolder(): Holder? = currentHolder
}
