package com.visp.mobile.srt

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.content.ContextCompat

class StreamForegroundService : Service() {
  override fun onCreate() {
    super.onCreate()
    val manager = getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      manager.createNotificationChannel(
        NotificationChannel(CHANNEL_ID, "Live streaming", NotificationManager.IMPORTANCE_LOW),
      )
    }

    val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
    val pendingIntent = launchIntent?.let {
      PendingIntent.getActivity(
        this,
        0,
        it,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
    }
    val builder =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        Notification.Builder(this, CHANNEL_ID)
      } else {
        @Suppress("DEPRECATION")
        Notification.Builder(this)
      }
    val notification =
      builder
        .setSmallIcon(applicationInfo.icon)
        .setContentTitle("VISP is live")
        .setContentText("Camera and microphone streaming is active")
        .setContentIntent(pendingIntent)
        .setCategory(Notification.CATEGORY_SERVICE)
        .setOngoing(true)
        .build()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIFICATION_ID, notification, SERVICE_TYPES)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int = START_NOT_STICKY

  override fun onBind(intent: Intent?): IBinder? = null

  companion object {
    private const val CHANNEL_ID = "visp-live-stream"
    private const val NOTIFICATION_ID = 1_006
    private const val SERVICE_TYPES =
      ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA or
        ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE

    fun start(context: Context) {
      ContextCompat.startForegroundService(context, Intent(context, StreamForegroundService::class.java))
    }

    fun stop(context: Context) {
      context.stopService(Intent(context, StreamForegroundService::class.java))
    }
  }
}
