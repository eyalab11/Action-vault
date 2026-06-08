package com.actionvault.app

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class ActionVaultNotificationsModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "ActionVaultNotifications"

  private val channelId = "actionvault_reel_ready"
  private val processingNotificationId = 4107

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = reactContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val existing = manager.getNotificationChannel(channelId)
    if (existing != null) return

    val channel = NotificationChannel(
      channelId,
      "ActionVault",
      NotificationManager.IMPORTANCE_DEFAULT,
    ).apply {
      description = "Background saves and ready notifications"
    }
    manager.createNotificationChannel(channel)
  }

  private fun buildDeepLinkPendingIntent(uri: Uri): PendingIntent {
    val intent = Intent(Intent.ACTION_VIEW, uri).apply {
      `package` = reactContext.packageName
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
    }

    val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    } else {
      PendingIntent.FLAG_UPDATE_CURRENT
    }

    return PendingIntent.getActivity(reactContext, 0, intent, flags)
  }

  @ReactMethod
  fun showProcessingNotification(title: String?, body: String?) {
    ensureChannel()
    val deepLink = Uri.parse("actionvault:///add")
    val pendingIntent = buildDeepLinkPendingIntent(deepLink)

    val notification = NotificationCompat.Builder(reactContext, channelId)
      .setSmallIcon(R.mipmap.ic_launcher)
      .setContentTitle(title ?: "Saving your reel…")
      .setContentText(body ?: "ActionVault is analyzing it in the background")
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setContentIntent(pendingIntent)
      .build()

    notifySafely(processingNotificationId, notification)
  }

  @ReactMethod
  fun cancelProcessingNotification() {
    NotificationManagerCompat.from(reactContext).cancel(processingNotificationId)
  }

  @ReactMethod
  fun showReadyNotification(itemId: String, title: String?, body: String?) {
    ensureChannel()
    val deepLink = Uri.parse("actionvault:///items/$itemId")
    val pendingIntent = buildDeepLinkPendingIntent(deepLink)

    val notification = NotificationCompat.Builder(reactContext, channelId)
      .setSmallIcon(R.mipmap.ic_launcher)
      .setContentTitle(title ?: "Your AI reel is ready")
      .setContentText(body ?: "Tap to view")
      .setAutoCancel(true)
      .setContentIntent(pendingIntent)
      .build()

    NotificationManagerCompat.from(reactContext).cancel(processingNotificationId)
    notifySafely(itemId.hashCode(), notification)
  }

  @ReactMethod
  fun showErrorNotification(title: String?, body: String?) {
    ensureChannel()
    val deepLink = Uri.parse("actionvault:///add")
    val pendingIntent = buildDeepLinkPendingIntent(deepLink)

    val notification = NotificationCompat.Builder(reactContext, channelId)
      .setSmallIcon(R.mipmap.ic_launcher)
      .setContentTitle(title ?: "Could not save this reel")
      .setContentText(body ?: "Tap to open ActionVault")
      .setAutoCancel(true)
      .setContentIntent(pendingIntent)
      .build()

    NotificationManagerCompat.from(reactContext).cancel(processingNotificationId)
    notifySafely(nowNotificationId(), notification)
  }

  private fun nowNotificationId(): Int {
    return (System.currentTimeMillis() % Int.MAX_VALUE).toInt()
  }

  private fun notifySafely(id: Int, notification: android.app.Notification) {
    try {
      NotificationManagerCompat.from(reactContext).notify(id, notification)
    } catch (_: SecurityException) {
      // Android 13+ can block notifications until the user grants permission.
    }
  }
}

