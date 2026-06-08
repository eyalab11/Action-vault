package com.actionvault.app

import android.content.Intent
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

/**
 * Android service that runs a React Native Headless JS task to analyze a shared URL.
 */
class ShareAnalyzeService : HeadlessJsTaskService() {
  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
    val sharedText = intent?.getStringExtra("sharedText") ?: return null
    val data = Arguments.createMap().apply {
      putString("sharedText", sharedText)
    }

    // 2 minutes should cover slow networks + cold backend starts.
    return HeadlessJsTaskConfig(
      "ShareAnalyzeTask",
      data,
      120_000,
      true,
    )
  }
}

