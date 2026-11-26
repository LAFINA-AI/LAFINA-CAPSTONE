package com.lafina.capstone

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.net.InetAddress
import java.net.UnknownHostException
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

class AndroidConnectivityModule(
    reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

    private val dnsExecutor = Executors.newFixedThreadPool(2) { task ->
        Thread(task, "lafina-dns-probe").apply { isDaemon = true }
    }
    private val timeoutExecutor = Executors.newSingleThreadScheduledExecutor { task ->
        Thread(task, "lafina-dns-timeout").apply { isDaemon = true }
    }

    override fun getName(): String = "AndroidConnectivityModule"

    override fun invalidate() {
        dnsExecutor.shutdownNow()
        timeoutExecutor.shutdownNow()
        super.invalidate()
    }

    @ReactMethod
    fun isOnline(promise: Promise) {
        try {
            val manager = reactApplicationContext.getSystemService(
                Context.CONNECTIVITY_SERVICE
            ) as ConnectivityManager
            val activeNetwork = manager.activeNetwork
            if (activeNetwork == null) {
                promise.resolve(false)
                return
            }
            val capabilities = manager.getNetworkCapabilities(activeNetwork)
            val hasInternet = capabilities?.hasCapability(
                NetworkCapabilities.NET_CAPABILITY_INTERNET
            ) == true
            val hasTransport =
                capabilities?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true ||
                    capabilities?.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) == true ||
                    capabilities?.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) == true ||
                    capabilities?.hasTransport(NetworkCapabilities.TRANSPORT_VPN) == true
            promise.resolve(hasInternet && hasTransport)
        } catch (error: Exception) {
            promise.reject("CONNECTIVITY_CHECK_ERROR", error.message, error)
        }
    }

    @ReactMethod
    fun canResolve(host: String, promise: Promise) {
        val trimmed = host.trim()
        if (trimmed.isEmpty() || dnsExecutor.isShutdown || timeoutExecutor.isShutdown) {
            promise.resolve(false)
            return
        }
        val settled = AtomicBoolean(false)
        try {
            val lookup = dnsExecutor.submit {
                val resolved = try {
                    InetAddress.getAllByName(trimmed).isNotEmpty()
                } catch (_: UnknownHostException) {
                    false
                } catch (_: Exception) {
                    false
                }
                if (settled.compareAndSet(false, true)) {
                    promise.resolve(resolved)
                }
            }
            timeoutExecutor.schedule({
                if (settled.compareAndSet(false, true)) {
                    lookup.cancel(true)
                    promise.resolve(false)
                }
            }, 4, TimeUnit.SECONDS)
        } catch (_: Exception) {
            if (settled.compareAndSet(false, true)) {
                promise.resolve(false)
            }
        }
    }
}
