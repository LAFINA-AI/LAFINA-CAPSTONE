package com.lafina.capstone

import java.io.File

/**
 * Separate-process probe for [MicrophoneLeaseTest]. It receives only a synthetic,
 * empty lock-file path in a temp directory, acquires the lease, reports it and then
 * waits until the test kills it (simulating process death).
 *
 * Adapted from the LAFINA donor `MicrophoneLeaseProbe.kt` (blob 6ebcd538), which ran
 * as an instrumentation `app_process`; this one runs on the host JVM.
 */
object MicrophoneLeaseProbe {
  @JvmStatic
  fun main(args: Array<String>) {
    val lease = MicrophoneLeaseRegistry { File(args.single()) }
    val ticket = lease.tryAcquire(MicrophoneLeaseRegistry.Holder.MEETING_RECORDER)
    println(if (ticket?.osLocked == true) "ACQUIRED" else "BUSY")
    System.out.flush()
    if (ticket == null) return
    Thread.sleep(60_000)
  }
}
