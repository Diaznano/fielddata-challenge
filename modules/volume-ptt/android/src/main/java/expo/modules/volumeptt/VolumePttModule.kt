package expo.modules.volumeptt

import android.view.KeyEvent
import android.view.Window
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class VolumePttModule : Module() {
  private var wrapped: Window? = null

  override fun definition() = ModuleDefinition {
    Name("VolumePtt")
    Events("onVolumeDown")
    OnCreate { install() }
    OnActivityEntersForeground { install() }
  }

  // Envuelve el Window.Callback de la Activity para interceptar la tecla sin tocar MainActivity (CNG).
  private fun install() {
    val activity = appContext.currentActivity ?: return
    activity.runOnUiThread {
      val window = activity.window
      if (wrapped === window) return@runOnUiThread
      val original = window.callback
      window.callback = object : Window.Callback by original {
        override fun dispatchKeyEvent(event: KeyEvent): Boolean {
          if (event.keyCode != KeyEvent.KEYCODE_VOLUME_DOWN) return original.dispatchKeyEvent(event)
          if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) sendEvent("onVolumeDown", mapOf<String, Any>())
          return true
        }
      }
      wrapped = window
    }
  }
}
