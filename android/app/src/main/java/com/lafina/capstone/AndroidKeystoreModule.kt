package com.lafina.capstone

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyPermanentlyInvalidatedException
import android.security.keystore.KeyProperties
import java.security.UnrecoverableKeyException
import android.util.Base64
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class AndroidKeystoreModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val KEY_ALIAS = "LafinaRefreshTokenKey"
    private val ANDROID_KEYSTORE = "AndroidKeyStore"
    private val TRANSFORMATION = "AES/GCM/NoPadding"
    private val GCM_TAG_LENGTH = 128

    override fun getName(): String = "AndroidKeystoreModule"

    @Synchronized
    private fun getOrCreateSecretKey(forceRecreate: Boolean = false): SecretKey {
        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE)
        keyStore.load(null)

        if (forceRecreate) {
            try {
                if (keyStore.containsAlias(KEY_ALIAS)) keyStore.deleteEntry(KEY_ALIAS)
            } catch (_: Exception) {
            }
        } else if (keyStore.containsAlias(KEY_ALIAS)) {
            val entry = try {
                keyStore.getEntry(KEY_ALIAS, null) as? KeyStore.SecretKeyEntry
            } catch (_: Exception) {
                null
            }
            if (entry?.secretKey != null) {
                return entry.secretKey
            }
            try { keyStore.deleteEntry(KEY_ALIAS) } catch (_: Exception) {}
        }

        val keyGenerator =
            KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        val spec = KeyGenParameterSpec.Builder(
            KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .build()

        keyGenerator.init(spec)
        return keyGenerator.generateKey()
    }

    private fun encryptWithKey(plainText: String, secretKey: SecretKey): String {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, secretKey)

        val iv = cipher.iv
        val encryptedBytes = cipher.doFinal(plainText.toByteArray(Charsets.UTF_8))

        val combined = ByteArray(iv.size + encryptedBytes.size)
        System.arraycopy(iv, 0, combined, 0, iv.size)
        System.arraycopy(encryptedBytes, 0, combined, iv.size, encryptedBytes.size)

        return Base64.encodeToString(combined, Base64.NO_WRAP)
    }

    @ReactMethod
    fun encryptString(plainText: String, promise: Promise) {
        try {
            val encoded = try {
                encryptWithKey(plainText, getOrCreateSecretKey())
            } catch (e: Exception) {
                if (e is KeyPermanentlyInvalidatedException || e is UnrecoverableKeyException) {
                    encryptWithKey(plainText, getOrCreateSecretKey(forceRecreate = true))
                } else {
                    throw e
                }
            }
            promise.resolve(encoded)
        } catch (e: Exception) {
            promise.reject("KEYSTORE_ENCRYPT_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun decryptString(cipherTextBase64: String, promise: Promise) {
        try {
            val combined = Base64.decode(cipherTextBase64, Base64.NO_WRAP)
            if (combined.size <= 12) {
                promise.reject("KEYSTORE_DECRYPT_ERROR", "Invalid payload length")
                return
            }

            val iv = ByteArray(12)
            System.arraycopy(combined, 0, iv, 0, 12)

            val encryptedBytes = ByteArray(combined.size - 12)
            System.arraycopy(combined, 12, encryptedBytes, 0, encryptedBytes.size)

            val secretKey = getOrCreateSecretKey()
            val cipher = Cipher.getInstance(TRANSFORMATION)
            val gcmSpec = GCMParameterSpec(GCM_TAG_LENGTH, iv)
            cipher.init(Cipher.DECRYPT_MODE, secretKey, gcmSpec)

            val decryptedBytes = cipher.doFinal(encryptedBytes)
            val plainText = String(decryptedBytes, Charsets.UTF_8)
            promise.resolve(plainText)
        } catch (e: Exception) {
            promise.reject("KEYSTORE_DECRYPT_ERROR", e.message, e)
        }
    }
}
