package com.lafina.capstone

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.provider.MediaStore
import androidx.core.content.FileProvider
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import java.io.File

class LafinaVisionModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private var pendingCameraPromise: Promise? = null
  private var currentPhotoPath: String? = null

  private val activityEventListener: ActivityEventListener =
    object : BaseActivityEventListener() {
      override fun onActivityResult(
        activity: Activity,
        requestCode: Int,
        resultCode: Int,
        data: Intent?
      ) {
        if (requestCode == REQUEST_IMAGE_CAPTURE) {
          val promise = pendingCameraPromise
          val photoPath = currentPhotoPath
          pendingCameraPromise = null
          currentPhotoPath = null

          if (promise == null) return

          if (resultCode == Activity.RESULT_OK && photoPath != null) {
            val file = File(photoPath)
            if (file.exists() && file.length() > 0) {
              val result: WritableMap = Arguments.createMap()
              result.putString("uri", Uri.fromFile(file).toString())
              result.putString("path", file.absolutePath)
              promise.resolve(result)
            } else {
              promise.reject("CAMERA_ERROR", "Captured file not found or empty.")
            }
          } else {
            // User cancelled
            promise.resolve(null)
          }
        }
      }
    }

  init {
    reactContext.addActivityEventListener(activityEventListener)
  }

  override fun getName(): String = "LafinaVision"

  @ReactMethod
  fun isAvailable(promise: Promise) {
    promise.resolve(true)
  }

  @ReactMethod
  fun takePhoto(promise: Promise) {
    val activity = reactContext.currentActivity
    if (activity == null) {
      promise.reject("ACTIVITY_UNAVAILABLE", "Cannot take photo: current activity is null.")
      return
    }

    if (pendingCameraPromise != null) {
      promise.reject("BUSY", "Another camera operation is already in progress.")
      return
    }

    try {
      val intent = Intent(MediaStore.ACTION_IMAGE_CAPTURE)
      val packageManager = activity.packageManager
      if (intent.resolveActivity(packageManager) == null) {
        promise.reject("CAMERA_UNAVAILABLE", "No camera app found on device.")
        return
      }

      val cacheDir = File(reactContext.cacheDir, "camera_captures")
      if (!cacheDir.exists()) cacheDir.mkdirs()

      val photoFile = File(cacheDir, "schedule_${System.currentTimeMillis()}.jpg")
      currentPhotoPath = photoFile.absolutePath

      val photoUri: Uri = FileProvider.getUriForFile(
        reactContext,
        "${reactContext.packageName}.fileprovider",
        photoFile
      )

      intent.putExtra(MediaStore.EXTRA_OUTPUT, photoUri)
      intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)

      pendingCameraPromise = promise
      activity.startActivityForResult(intent, REQUEST_IMAGE_CAPTURE)
    } catch (e: Exception) {
      pendingCameraPromise = null
      currentPhotoPath = null
      promise.reject("CAMERA_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun recognizeText(uriString: String, promise: Promise) {
    try {
      val uri = Uri.parse(uriString)
      val image: InputImage = InputImage.fromFilePath(reactContext, uri)
      val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)

      recognizer.process(image)
        .addOnSuccessListener { visionText ->
          val result: WritableMap = Arguments.createMap()
          result.putString("text", visionText.text)
          result.putInt("blockCount", visionText.textBlocks.size)
          promise.resolve(result)
        }
        .addOnFailureListener { e ->
          promise.reject("OCR_FAILED", e.message, e)
        }
    } catch (e: Exception) {
      promise.reject("IMAGE_ERROR", e.message, e)
    }
  }

  companion object {
    private const val REQUEST_IMAGE_CAPTURE = 9201
  }
}

