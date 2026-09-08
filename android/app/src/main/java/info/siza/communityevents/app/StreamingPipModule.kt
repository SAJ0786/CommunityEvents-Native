package info.siza.communityevents.app

import android.app.PictureInPictureParams
import android.os.Build
import android.content.res.Configuration
import android.util.Rational
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil

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
    UiThreadUtil.runOnUiThread {
      MainActivity.streamingPipActive = active
      reactContext.getSharedPreferences("community_connect_streaming", 0)
        .edit().putBoolean("pip_stream_active", active).apply()
      (reactContext.currentActivity as? MainActivity)?.updateStreamingPipState(active)
    }
  }

  @ReactMethod
  fun enterPictureInPicture(promise: Promise) {
    UiThreadUtil.runOnUiThread {
      val activity = reactContext.currentActivity
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || activity == null || !MainActivity.streamingPipActive) {
        promise.resolve(false)
        return@runOnUiThread
      }
      try {
        promise.resolve(activity.enterPictureInPictureMode(pictureInPictureParams(true)))
      } catch (error: IllegalStateException) {
        promise.resolve(false)
      } catch (error: SecurityException) {
        promise.resolve(false)
      }
    }
  }
}
