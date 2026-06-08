package com.actionvault.app

import android.app.Activity
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.widget.Toast
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.facebook.react.HeadlessJsTaskService

/**
 * Lightweight share target that immediately returns control to the source app
 * (Instagram, Chrome, etc.) while kicking off a background Headless JS task.
 */
class ShareReceiverActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    handleIntent(intent)
    finish()
  }

  override fun onNewIntent(intent: Intent?) {
    super.onNewIntent(intent)
    handleIntent(intent)
    finish()
  }

  private fun handleIntent(intent: Intent?) {
    if (intent?.action != Intent.ACTION_SEND) return
    if (intent.type != "text/plain") return

    val sharedText = intent.getStringExtra(Intent.EXTRA_TEXT) ?: return
    Toast.makeText(applicationContext, "Saving in ActionVault…", Toast.LENGTH_SHORT).show()
    showProcessingNotification()

    val serviceIntent = Intent(applicationContext, ShareAnalyzeService::class.java)
    serviceIntent.putExtra("sharedText", sharedText)

    HeadlessJsTaskService.acquireWakeLockNow(applicationContext)
    applicationContext.startService(serviceIntent)
  }

  private fun showProcessingNotification() {
    val channelId = "actionvault_reel_ready"
    val notificationId = 4107

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      if (manager.getNotificationChannel(channelId) == null) {
        manager.createNotificationChannel(
          NotificationChannel(channelId, "ActionVault", NotificationManager.IMPORTANCE_DEFAULT).apply {
            description = "Background saves and ready notifications"
          },
        )
      }
    }

    val deepLink = Uri.parse("actionvault:///add")
    val openIntent = Intent(Intent.ACTION_VIEW, deepLink).apply {
      `package` = packageName
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
    }
    val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    } else {
      PendingIntent.FLAG_UPDATE_CURRENT
    }
    val pendingIntent = PendingIntent.getActivity(this, 0, openIntent, flags)

    val notification = NotificationCompat.Builder(this, channelId)
      .setSmallIcon(R.mipmap.ic_launcher)
      .setContentTitle("Saving your reel…")
      .setContentText("ActionVault is analyzing it in the background")
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setContentIntent(pendingIntent)
      .build()

    try {
      NotificationManagerCompat.from(this).notify(notificationId, notification)
    } catch (_: SecurityException) {
      // Notification permission may not be granted yet; the toast still confirms the share.
    }
  }
}

