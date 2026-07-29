package com.visp.mobile.srt

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import java.net.Inet4Address
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import org.json.JSONObject

internal object BondedSrtNative {
  init {
    System.loadLibrary("visp_srt_bond")
  }

  private var cellularCallback: ConnectivityManager.NetworkCallback? = null

  data class Stats(
    val bitrateKbps: Int,
    val links: List<Map<String, Any>>,
    val packetLossPct: Double,
    val rttMs: Int,
  )

  fun start(context: Context, url: String, mode: String): Int {
    val manager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    val latch = CountDownLatch(1)
    val callback =
      object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
          latch.countDown()
        }
      }
    cellularCallback?.let { runCatching { manager.unregisterNetworkCallback(it) } }
    cellularCallback = callback
    manager.requestNetwork(
      NetworkRequest.Builder()
        .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
        .addTransportType(NetworkCapabilities.TRANSPORT_CELLULAR)
        .build(),
      callback,
    )
    latch.await(4, TimeUnit.SECONDS)
    val sources = mutableListOf<Pair<String, String>>()
    manager.allNetworks.forEach { network ->
      val capabilities = manager.getNetworkCapabilities(network) ?: return@forEach
      val transport =
        when {
          capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "wifi"
          capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "cellular"
          else -> return@forEach
        }
      manager.getLinkProperties(network)
        ?.linkAddresses
        ?.firstOrNull { it.address is Inet4Address && !it.address.isLoopbackAddress }
        ?.address
        ?.hostAddress
        ?.let { address ->
          if (sources.none { it.second == transport }) sources.add(address to transport)
        }
    }
    try {
      check(nativeProbe()) { "libsrt bonding is unavailable" }
      check(sources.isNotEmpty()) { "No Wi-Fi or cellular source address is available" }
      return nativeStart(
        sources.map { it.first }.toTypedArray(),
        sources.map { it.second }.toTypedArray(),
        url,
        mode,
      ).also { check(it > 0) { "Could not start bonded SRT" } }
    } catch (error: Throwable) {
      stop(context)
      throw error
    }
  }

  fun stop(context: Context) {
    nativeStop()
    val manager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    cellularCallback?.let { runCatching { manager.unregisterNetworkCallback(it) } }
    cellularCallback = null
  }

  fun stats(): Stats? {
    val value = nativeStats() ?: return null
    val json = JSONObject(value)
    val linksJson = json.getJSONArray("links")
    val links = buildList {
      for (index in 0 until linksJson.length()) {
        val link = linksJson.getJSONObject(index)
        add(
          mapOf(
            "id" to link.getString("id"),
            "transport" to link.getString("transport"),
            "state" to link.getString("state"),
            "rttMs" to link.getInt("rttMs"),
            "packetLossPct" to link.getDouble("packetLossPct"),
            "bitrateKbps" to link.getInt("bitrateKbps"),
          ),
        )
      }
    }
    return Stats(
      bitrateKbps = json.getInt("bitrateKbps"),
      links = links,
      packetLossPct = json.getDouble("packetLossPct"),
      rttMs = json.getInt("rttMs"),
    )
  }

  private external fun nativeProbe(): Boolean
  private external fun nativeStart(
    sourceIps: Array<String>,
    transports: Array<String>,
    url: String,
    mode: String,
  ): Int
  private external fun nativeStats(): String?
  private external fun nativeStop()
}
