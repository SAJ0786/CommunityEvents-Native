package info.siza.communityevents.app

import android.app.PictureInPictureParams
import android.os.Build
import android.content.res.Configuration
import android.util.Rational
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class StreamingPipModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  override fun getName() = "StreamingPip"

  private fun aspectRatioForCurrentOrientation(): Rational {
    return if (reactContext.resources.configuration.orientation == Configuration.ORIENTATION_LANDSCAPE) {
      Rational(16, 9)
    } else {
      Rational(9, 16)
    }
  }

  private fun pictureInPictureParams(autoEnter: Boolean): PictureInPictureParams {
    val builder = PictureInPictureParams.Builder()
      .setAspectRatio(aspectRatioForCurrentOrientation())
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      builder.setAutoEnterEnabled(autoEnter)
      builder.setSeamlessResizeEnabled(true)
    }
    return builder.build()
  }

  @ReactMethod
  fun setStreamingActive(active: Boolean) {
    MainActivity.streamingPipActive = active
    reactContext.getSharedPreferences("community_connect_streaming", 0)
      .edit().putBoolean("pip_stream_active", active).apply()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      reactContext.currentActivity?.setPictureInPictureParams(pictureInPictureParams(active))
    }
  }

  @ReactMethod
  fun enterPictureInPicture(promise: Promise) {
    val activity = reactContext.currentActivity
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || activity == null || !MainActivity.streamingPipActive) {
      promise.resolve(false)
      return
    }
    promise.resolve(activity.enterPictureInPictureMode(pictureInPictureParams(true)))
  }
}
