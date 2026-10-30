package com.hydropulse.app;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.provider.Settings;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.util.Log;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.MulticastSocket;
import java.net.NetworkInterface;
import java.net.URL;
import java.util.ArrayList;
import java.util.Enumeration;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "EndlessPoolsUdp")
public class EndlessPoolsUdpPlugin extends Plugin {
    private static final String TAG = "EndlessPoolsUdp";
    private static final String MULTICAST_GROUP = "239.255.0.1";
    private static final int MULTICAST_PORT = 45654;
    private static final char[] HEX_CHARS = "0123456789abcdef".toCharArray();

    private MulticastSocket multicastSocket = null;
    private WifiManager.MulticastLock multicastLock = null;
    private PowerManager.WakeLock wakeLock = null;
    private Thread listenerThread = null;
    private volatile boolean isRunning = false;

    // Single-thread executor for guaranteed in-order FIFO command packet transmission
    private ExecutorService sendExecutor = null;

    // Native Speech Recognizer for Hands-Free Swimming Voice Commands
    private SpeechRecognizer speechRecognizer = null;
    private Intent speechIntent = null;
    private boolean isSpeechListening = false;
    private boolean shouldKeepSpeechListening = false;
    private Handler mainHandler = new Handler(Looper.getMainLooper());

    @PluginMethod
    public void startListener(PluginCall call) {
        if (isRunning) {
            call.resolve();
            return;
        }

        try {
            Context ctx = getContext().getApplicationContext();

            // 1. Acquire Wi-Fi Multicast Lock (Mandatory for Android 14/15 on Pixel 8)
            WifiManager wifiManager = (WifiManager) ctx.getSystemService(Context.WIFI_SERVICE);
            if (wifiManager != null) {
                multicastLock = wifiManager.createMulticastLock("HydroPulseMulticast");
                multicastLock.setReferenceCounted(true);
                multicastLock.acquire();
                Log.d(TAG, "MulticastLock acquired successfully");
            }

            // 2. Acquire Screen Wake Lock
            PowerManager powerManager = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
            if (powerManager != null) {
                wakeLock = powerManager.newWakeLock(PowerManager.SCREEN_BRIGHT_WAKE_LOCK, "HydroPulse:HUD");
                wakeLock.acquire(4 * 60 * 60 * 1000L); // 4 hour max timeout
                Log.d(TAG, "WakeLock acquired for poolside HUD");
            }

            // 3. Setup Multicast Socket
            multicastSocket = new MulticastSocket(MULTICAST_PORT);
            multicastSocket.setReuseAddress(true);
            InetAddress group = InetAddress.getByName(MULTICAST_GROUP);

            // Join on all active multicast-capable network interfaces (ensures wlan0 is joined even if cell data is on)
            try {
                Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
                while (interfaces != null && interfaces.hasMoreElements()) {
                    NetworkInterface iface = interfaces.nextElement();
                    if (iface.isUp() && iface.supportsMulticast() && !iface.isLoopback()) {
                        try {
                            multicastSocket.joinGroup(new InetSocketAddress(group, MULTICAST_PORT), iface);
                            Log.d(TAG, "Joined multicast group on interface: " + iface.getName());
                        } catch (Exception ignored) {}
                    }
                }
            } catch (Exception e) {
                // Fallback join
                multicastSocket.joinGroup(group);
            }

            isRunning = true;
            sendExecutor = Executors.newSingleThreadExecutor();

            // 4. Start Receiver Thread
            listenerThread = new Thread(new Runnable() {
                @Override
                public void run() {
                    byte[] buffer = new byte[512];
                    Log.d(TAG, "UDP listener started on port " + MULTICAST_PORT);

                    while (isRunning && multicastSocket != null && !multicastSocket.isClosed()) {
                        try {
                            DatagramPacket packet = new DatagramPacket(buffer, buffer.length);
                            multicastSocket.receive(packet);
                            int len = packet.getLength();

                            if (len == 111) {
                                String hex = bytesToHex(packet.getData(), packet.getOffset(), len);
                                JSObject ret = new JSObject();
                                ret.put("packetHex", hex);
                                ret.put("senderIp", packet.getAddress().getHostAddress());
                                notifyListeners("onUdpPacket", ret);
                            }
                        } catch (Exception e) {
                            if (isRunning) {
                                Log.w(TAG, "UDP receive exception: " + e.getMessage());
                            }
                        }
                    }
                }
            });
            listenerThread.setDaemon(true);
            listenerThread.start();

            call.resolve();
        } catch (Exception e) {
            Log.e(TAG, "startListener error: " + e.getMessage(), e);
            call.reject("Failed to start UDP listener: " + e.getMessage());
        }
    }

    @PluginMethod
    public void sendPacket(final PluginCall call) {
        final String hex = call.getString("hex");
        final String targetIp = call.getString("targetIp", "255.255.255.255");
        final int targetPort = call.getInt("targetPort", 9750);

        if (hex == null || hex.isEmpty()) {
            call.reject("Hex payload is required");
            return;
        }

        if (sendExecutor == null || sendExecutor.isShutdown()) {
            sendExecutor = Executors.newSingleThreadExecutor();
        }

        sendExecutor.execute(new Runnable() {
            @Override
            public void run() {
                DatagramSocket socket = null;
                try {
                    byte[] data = hexToBytes(hex);
                    socket = new DatagramSocket();
                    socket.setBroadcast(true);
                    InetAddress address = InetAddress.getByName(targetIp);
                    DatagramPacket packet = new DatagramPacket(data, data.length, address, targetPort);
                    socket.send(packet);
                    call.resolve();
                } catch (Exception e) {
                    Log.e(TAG, "sendPacket error: " + e.getMessage(), e);
                    call.reject("Failed to send UDP packet: " + e.getMessage());
                } finally {
                    if (socket != null) {
                        socket.close();
                    }
                }
            }
        });
    }

    @PluginMethod
    public void stopListener(PluginCall call) {
        cleanup();
        call.resolve();
    }

    @PluginMethod
    public void openExternalUrl(PluginCall call) {
        String urlStr = call.getString("url");
        if (urlStr == null || urlStr.isEmpty()) {
            call.reject("URL cannot be empty");
            return;
        }
        try {
            Context ctx = getContext();
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(urlStr));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            Log.e(TAG, "Failed to open URL: " + e.getMessage(), e);
            call.reject("Failed to open URL: " + e.getMessage());
        }
    }

    @PluginMethod
    public void downloadAndInstallApk(PluginCall call) {
        String apkUrl = call.getString("apkUrl");
        if (apkUrl == null || apkUrl.isEmpty()) {
            call.reject("apkUrl cannot be empty");
            return;
        }

        Context ctx = getContext().getApplicationContext();

        // Check if Android allows installing unknown apps from this source
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (!ctx.getPackageManager().canRequestPackageInstalls()) {
                Intent permissionIntent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
                permissionIntent.setData(Uri.parse("package:" + ctx.getPackageName()));
                permissionIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(permissionIntent);
            }
        }

        Executors.newSingleThreadExecutor().execute(new Runnable() {
            @Override
            public void run() {
                try {
                    File cacheDir = ctx.getExternalCacheDir();
                    if (cacheDir == null) {
                        cacheDir = ctx.getCacheDir();
                    }

                    File apkFile = new File(cacheDir, "hydropulse-update.apk");
                    if (apkFile.exists()) {
                        apkFile.delete();
                    }

                    Log.d(TAG, "Starting native APK download from: " + apkUrl);
                    URL url = new URL(apkUrl);
                    HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                    conn.setInstanceFollowRedirects(true);
                    conn.setConnectTimeout(15000);
                    conn.setReadTimeout(30000);
                    conn.connect();

                    // Follow HTTP redirects (301, 302, 307, 308) commonly used by GitHub Releases
                    int responseCode = conn.getResponseCode();
                    if (responseCode == HttpURLConnection.HTTP_MOVED_TEMP ||
                        responseCode == HttpURLConnection.HTTP_MOVED_PERM ||
                        responseCode == 307 || responseCode == 308) {
                        String newUrl = conn.getHeaderField("Location");
                        conn.disconnect();
                        url = new URL(newUrl);
                        conn = (HttpURLConnection) url.openConnection();
                        conn.setConnectTimeout(15000);
                        conn.setReadTimeout(30000);
                        conn.connect();
                    }

                    int totalLength = conn.getContentLength();
                    InputStream in = conn.getInputStream();
                    FileOutputStream out = new FileOutputStream(apkFile);
                    byte[] buffer = new byte[8192];
                    int bytesRead;
                    long totalBytesRead = 0;
                    long lastNotifyTime = 0;

                    while ((bytesRead = in.read(buffer)) != -1) {
                        out.write(buffer, 0, bytesRead);
                        totalBytesRead += bytesRead;

                        long now = System.currentTimeMillis();
                        if (now - lastNotifyTime > 150) {
                            lastNotifyTime = now;
                            int pct = totalLength > 0 ? (int) ((totalBytesRead * 100) / totalLength) : 0;
                            JSObject progressData = new JSObject();
                            progressData.put("progress", pct);
                            progressData.put("bytesRead", totalBytesRead);
                            progressData.put("totalBytes", totalLength);
                            notifyListeners("updateProgress", progressData);
                        }
                    }
                    out.flush();
                    out.close();
                    in.close();
                    conn.disconnect();

                    Log.d(TAG, "APK download complete (" + apkFile.length() + " bytes). Launching Android Package Installer.");

                    JSObject doneProgress = new JSObject();
                    doneProgress.put("progress", 100);
                    doneProgress.put("bytesRead", apkFile.length());
                    doneProgress.put("totalBytes", apkFile.length());
                    notifyListeners("updateProgress", doneProgress);

                    Uri apkUri = FileProvider.getUriForFile(
                            ctx,
                            ctx.getPackageName() + ".fileprovider",
                            apkFile
                    );

                    Intent installIntent = new Intent(Intent.ACTION_VIEW);
                    installIntent.setDataAndType(apkUri, "application/vnd.android.package-archive");
                    installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    installIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    ctx.startActivity(installIntent);

                    JSObject res = new JSObject();
                    res.put("success", true);
                    res.put("bytes", apkFile.length());
                    call.resolve(res);

                } catch (Exception e) {
                    Log.e(TAG, "Failed to download and install APK: " + e.getMessage(), e);
                    call.reject("Failed to install APK: " + e.getMessage());
                }
            }
        });
    }

    // Native Voice Recognition Methods for Wet Hands Poolside Control
    @PluginMethod
    public void startSpeechRecognition(PluginCall call) {
        getActivity().runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    if (speechRecognizer == null) {
                        initSpeechRecognizer();
                    }
                    shouldKeepSpeechListening = true;
                    startNativeListening();
                    JSObject res = new JSObject();
                    res.put("success", true);
                    call.resolve(res);
                } catch (Exception e) {
                    Log.e(TAG, "Failed to start speech recognition: " + e.getMessage(), e);
                    call.reject("Failed to start speech recognition: " + e.getMessage());
                }
            }
        });
    }

    @PluginMethod
    public void stopSpeechRecognition(PluginCall call) {
        getActivity().runOnUiThread(new Runnable() {
            @Override
            public void run() {
                shouldKeepSpeechListening = false;
                if (speechRecognizer != null) {
                    try {
                        speechRecognizer.stopListening();
                        speechRecognizer.cancel();
                    } catch (Exception ignored) {}
                }
                isSpeechListening = false;
                notifySpeechState(false, null);
                JSObject res = new JSObject();
                res.put("success", true);
                call.resolve(res);
            }
        });
    }

    private void initSpeechRecognizer() {
        Context ctx = getContext().getApplicationContext();
        if (!SpeechRecognizer.isRecognitionAvailable(ctx)) {
            Log.w(TAG, "SpeechRecognizer is not available on this device");
            return;
        }

        speechRecognizer = SpeechRecognizer.createSpeechRecognizer(ctx);
        speechIntent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        speechIntent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        speechIntent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        speechIntent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "en-US");
        speechIntent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 5);

        // 1. Force Google Tensor G3 On-Device Neural Model (Ultra-low latency, immune to Wi-Fi drops)
        speechIntent.putExtra("android.speech.extra.PREFER_OFFLINE", true);

        // 2. Vocabulary Biasing: Boost neural network beam search for pool commands over ambient music
        ArrayList<String> biasKeywords = new ArrayList<>();
        biasKeywords.add("stop");
        biasKeywords.add("start");
        biasKeywords.add("pause");
        biasKeywords.add("resume");
        biasKeywords.add("faster");
        biasKeywords.add("slower");
        biasKeywords.add("up 5");
        biasKeywords.add("up five");
        biasKeywords.add("down 5");
        biasKeywords.add("down five");
        biasKeywords.add("hydro stop");
        biasKeywords.add("hydro start");
        biasKeywords.add("pool stop");
        biasKeywords.add("pool start");
        biasKeywords.add("stop stop");
        biasKeywords.add("start start");
        speechIntent.putStringArrayListExtra("android.speech.extra.BIASING_STRINGS", biasKeywords);

        // 3. Ultra-responsive silence thresholds for rapid music recovery
        speechIntent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, 100L);
        speechIntent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 300L);
        speechIntent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 200L);

        speechRecognizer.setRecognitionListener(new RecognitionListener() {
            @Override
            public void onReadyForSpeech(Bundle params) {
                isSpeechListening = true;
                notifySpeechState(true, null);
            }

            @Override
            public void onBeginningOfSpeech() {}

            @Override
            public void onRmsChanged(float rmsdB) {}

            @Override
            public void onBufferReceived(byte[] buffer) {}

            @Override
            public void onEndOfSpeech() {}

            @Override
            public void onError(int error) {
                Log.d(TAG, "SpeechRecognizer status code: " + error);
                // Errors 6 (SPEECH_TIMEOUT) and 7 (NO_MATCH) are routine when music or splashing is heard
                if (shouldKeepSpeechListening) {
                    mainHandler.postDelayed(new Runnable() {
                        @Override
                        public void run() {
                            if (shouldKeepSpeechListening) {
                                startNativeListening();
                            }
                        }
                    }, 120);
                } else {
                    isSpeechListening = false;
                    notifySpeechState(false, "Code " + error);
                }
            }

            @Override
            public void onResults(Bundle results) {
                handleSpeechResults(results);
                if (shouldKeepSpeechListening) {
                    mainHandler.postDelayed(new Runnable() {
                        @Override
                        public void run() {
                            if (shouldKeepSpeechListening) {
                                startNativeListening();
                            }
                        }
                    }, 150);
                }
            }

            @Override
            public void onPartialResults(Bundle partialResults) {
                handleSpeechResults(partialResults);
            }

            @Override
            public void onEvent(int eventType, Bundle params) {}
        });
    }

    private void handleSpeechResults(Bundle results) {
        if (results == null) return;
        ArrayList<String> matches = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        if (matches != null && !matches.isEmpty()) {
            String bestMatch = matches.get(0);
            Log.d(TAG, "Speech hypotheses (" + matches.size() + "): " + matches);
            JSObject data = new JSObject();
            data.put("transcript", bestMatch);
            
            com.getcapacitor.JSArray arr = new com.getcapacitor.JSArray();
            for (String m : matches) {
                arr.put(m);
            }
            data.put("candidates", arr);
            notifyListeners("speechResult", data);
        }
    }

    private void startNativeListening() {
        if (speechRecognizer != null && speechIntent != null) {
            try {
                speechRecognizer.startListening(speechIntent);
                isSpeechListening = true;
                notifySpeechState(true, null);
            } catch (Exception e) {
                Log.e(TAG, "SpeechRecognizer start error", e);
            }
        }
    }

    private void notifySpeechState(boolean listening, String err) {
        JSObject data = new JSObject();
        data.put("isListening", listening);
        if (err != null) data.put("error", err);
        notifyListeners("speechState", data);
    }

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        cleanup();
    }

    private void cleanup() {
        isRunning = false;
        shouldKeepSpeechListening = false;
        if (speechRecognizer != null) {
            try {
                speechRecognizer.destroy();
                speechRecognizer = null;
            } catch (Exception ignored) {}
        }
        if (sendExecutor != null) {
            sendExecutor.shutdownNow();
            sendExecutor = null;
        }

        try {
            if (multicastSocket != null) {
                multicastSocket.close();
                multicastSocket = null;
            }
        } catch (Exception ignored) {}

        try {
            if (multicastLock != null && multicastLock.isHeld()) {
                multicastLock.release();
                multicastLock = null;
            }
        } catch (Exception ignored) {}

        try {
            if (wakeLock != null && wakeLock.isHeld()) {
                wakeLock.release();
                wakeLock = null;
            }
        } catch (Exception ignored) {}
    }

    private static String bytesToHex(byte[] bytes, int offset, int length) {
        char[] hexChars = new char[length * 2];
        for (int i = 0; i < length; i++) {
            int v = bytes[offset + i] & 0xFF;
            hexChars[i * 2] = HEX_CHARS[v >>> 4];
            hexChars[i * 2 + 1] = HEX_CHARS[v & 0x0F];
        }
        return new String(hexChars);
    }

    private static byte[] hexToBytes(String s) {
        int len = s.length();
        byte[] data = new byte[len / 2];
        for (int i = 0; i < len; i += 2) {
            data[i / 2] = (byte) ((Character.digit(s.charAt(i), 16) << 4)
                    + Character.digit(s.charAt(i + 1), 16));
        }
        return data;
    }
}
