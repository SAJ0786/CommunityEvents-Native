package info.siza.communityevents.app;

import android.Manifest;
import android.content.pm.PackageManager;
import android.view.Surface;
import android.view.SurfaceHolder;
import android.widget.FrameLayout;

import androidx.annotation.Nullable;
import androidx.core.content.ContextCompat;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.LifecycleEventListener;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.uimanager.ThemedReactContext;
import com.facebook.react.uimanager.events.RCTEventEmitter;
import com.pedro.common.ConnectChecker;
import com.pedro.encoder.input.video.CameraHelper;
import com.pedro.library.rtmp.RtmpCamera2;
import com.pedro.library.view.OpenGlView;

/**
 * React Native host for the proven Android native-wrapper streaming pipeline.
 *
 * This intentionally keeps preview, encoder preparation, fixed capture rotation,
 * surface readiness and RTMP reconnect in one native owner. The api.video Android
 * view inferred orientation and could receive React lifecycle callbacks between
 * preview configuration and RTMP start, which produced a valid preview but no
 * correctly oriented frames at YouTube.
 */
public final class AndroidRootEncoderLiveStreamView extends FrameLayout
        implements ConnectChecker, LifecycleEventListener, SurfaceHolder.Callback {
    private static final int WIDTH_720P = 1280;
    private static final int HEIGHT_720P = 720;
    private static final int FPS = 30;
    private static final int VIDEO_BITRATE = 4500 * 1024;
    private static final int AUDIO_BITRATE = 128 * 1024;

    private final ThemedReactContext reactContext;
    private final OpenGlView previewView;
    private final RtmpCamera2 camera;

    private boolean surfaceReady = false;
    private boolean previewStarted = false;
    private boolean videoPrepared = false;
    private boolean audioPrepared = false;
    private boolean muted = false;
    private boolean portraitMode = true;
    private boolean stopping = false;
    private boolean suppressDisconnectCallback = false;
    private boolean everConnected = false;
    private boolean reconnectPending = false;
    private boolean released = false;
    private int reconnectAttempts = 0;
    private int fixedCaptureRotation = 90;
    private CameraHelper.Facing facing = CameraHelper.Facing.BACK;
    private String lastRtmpUrl = "";
    private int pendingRequestId = 0;
    private String pendingRtmpUrl = "";
    private boolean pendingStartRetried = false;

    public AndroidRootEncoderLiveStreamView(ThemedReactContext context) {
        super(context);
        reactContext = context;
        previewView = new OpenGlView(context);
        previewView.getHolder().addCallback(this);
        addView(previewView, new FrameLayout.LayoutParams(
                LayoutParams.MATCH_PARENT,
                LayoutParams.MATCH_PARENT
        ));
        camera = new RtmpCamera2(previewView, this);
        context.addLifecycleEventListener(this);
    }

    public void setStreamOrientation(@Nullable String orientation) {
        portraitMode = !"landscape".equalsIgnoreCase(orientation);
        fixedCaptureRotation = portraitMode ? 90 : 0;
    }

    public void setCameraFacing(@Nullable String cameraFacing) {
        CameraHelper.Facing requested = "front".equalsIgnoreCase(cameraFacing)
                ? CameraHelper.Facing.FRONT
                : CameraHelper.Facing.BACK;
        if (requested == facing) return;
        facing = requested;
        if (previewStarted) {
            try {
                camera.switchCamera();
            } catch (Exception error) {
                sendConnectionFailed(errorMessage(error));
            }
        }
    }

    public void setMuted(boolean value) {
        muted = value;
        if (!camera.isStreaming()) return;
        if (muted) camera.disableAudio();
        else camera.enableAudio();
    }

    public void startStreaming(int requestId, String streamKey, @Nullable String url) {
        if (released) {
            sendStartResult(requestId, false, "The Android camera has already been released.");
            return;
        }
        if (camera.isStreaming() || pendingRequestId != 0) {
            sendStartResult(requestId, false, "A native stream is already starting or active.");
            return;
        }
        if (!hasStreamingPermissions()) {
            sendPermissionsDenied();
            sendStartResult(requestId, false, "Camera and microphone permissions are required.");
            return;
        }
        String baseUrl = url == null || url.trim().isEmpty()
                ? "rtmps://a.rtmp.youtube.com/live2"
                : trimTrailingSlash(url.trim());
        String cleanKey = streamKey == null ? "" : trimLeadingSlash(streamKey.trim());
        if (cleanKey.isEmpty()) {
            sendStartResult(requestId, false, "The YouTube stream key is missing.");
            return;
        }

        pendingRequestId = requestId;
        pendingRtmpUrl = baseUrl + "/" + cleanKey;
        pendingStartRetried = false;
        stopping = false;
        reconnectPending = false;
        reconnectAttempts = 0;
        everConnected = false;

        // Match the working wrapper: allow orientation/layout to settle before
        // configuring the encoder, then start only against a valid GL surface.
        postDelayed(this::startPendingWhenSurfaceReady, 650);
    }

    public void stopStreamingExplicitly() {
        stopping = true;
        disablePictureInPicture();
        reconnectPending = false;
        reconnectAttempts = 0;
        lastRtmpUrl = "";
        cancelPendingStart("Stream stopped before connection completed.");
        suppressDisconnectCallback = true;
        stopAllInternal();
        suppressDisconnectCallback = false;
    }

    private void disablePictureInPicture() {
        MainActivity.streamingPipActive = false;
        if (reactContext.getCurrentActivity() instanceof MainActivity) {
            ((MainActivity) reactContext.getCurrentActivity()).updateStreamingPipState(false);
        }
    }

    private void startPendingWhenSurfaceReady() {
        if (pendingRequestId == 0 || stopping || released) return;
        Surface surface = previewView.getHolder().getSurface();
        surfaceReady = surface != null && surface.isValid();
        if (!surfaceReady) {
            postDelayed(() -> {
                if (pendingRequestId != 0 && !surfaceReady) {
                    int requestId = pendingRequestId;
                    clearPendingStart();
                    sendStartResult(requestId, false, "Camera preview surface was not ready. Please close and try again.");
                }
            }, 5000);
            return;
        }
        postDelayed(this::runPendingStart, 300);
    }

    private void runPendingStart() {
        if (pendingRequestId == 0 || stopping || released) return;
        int requestId = pendingRequestId;
        String rtmpUrl = pendingRtmpUrl;
        try {
            configureFresh();
            startStreamInternal(rtmpUrl);
            lastRtmpUrl = rtmpUrl;
            clearPendingStart();
            sendStartResult(requestId, true, null);
        } catch (Exception error) {
            String message = errorMessage(error);
            boolean surfaceIssue = message.toLowerCase().contains("surface");
            if (surfaceIssue && !pendingStartRetried) {
                pendingStartRetried = true;
                suppressDisconnectCallback = true;
                stopAllInternal();
                suppressDisconnectCallback = false;
                postDelayed(this::startPendingWhenSurfaceReady, 700);
                return;
            }
            clearPendingStart();
            sendStartResult(requestId, false, message);
        }
    }

    private void configureFresh() {
        suppressDisconnectCallback = true;
        stopAllInternal();
        suppressDisconnectCallback = false;

        fixedCaptureRotation = portraitMode ? 90 : 0;
        previewView.setStreamRotation(0);
        previewView.setRotation(0);
        previewView.setEncoderSize(WIDTH_720P, HEIGHT_720P);
        videoPrepared = false;
        audioPrepared = false;
    }

    private void startStreamInternal(String rtmpUrl) {
        prepareEncoders();
        if (!previewStarted) {
            camera.startPreview(facing, WIDTH_720P, HEIGHT_720P, FPS, fixedCaptureRotation);
            previewStarted = true;
        }
        if (camera.isStreaming()) return;
        // The live session is user-owned: temporary transport failures must be
        // retried without ending capture or requiring another Go Live action.
        camera.getStreamClient().setReTries(Integer.MAX_VALUE);
        if (muted) camera.disableAudio();
        else camera.enableAudio();
        camera.startStream(rtmpUrl);
        if (!muted) camera.enableAudio();
    }

    private void prepareEncoders() {
        if (!videoPrepared) {
            videoPrepared = camera.prepareVideo(
                    WIDTH_720P,
                    HEIGHT_720P,
                    FPS,
                    VIDEO_BITRATE,
                    2,
                    fixedCaptureRotation
            );
            if (!videoPrepared) throw new IllegalStateException("Video encoder could not start.");
        }
        if (!audioPrepared) {
            audioPrepared = camera.prepareAudio(AUDIO_BITRATE, 44100, true, false, false);
            if (!audioPrepared) throw new IllegalStateException("Audio encoder could not start.");
        }
    }

    private void stopAllInternal() {
        if (camera.isStreaming()) camera.stopStream();
        if (previewStarted) {
            try {
                camera.stopPreview();
            } catch (Exception ignored) {
            }
            previewStarted = false;
        }
        videoPrepared = false;
        audioPrepared = false;
    }

    private void scheduleReconnect(String reason) {
        if (stopping || lastRtmpUrl.isEmpty() || released) return;
        if (reconnectPending) return;
        reconnectPending = true;
        reconnectAttempts++;
        long delayMs = reconnectAttempts == 1 ? (everConnected ? 1500 : 2500)
                : reconnectAttempts == 2 ? 5000
                : 8000;
        try {
            // RootEncoder owns the reconnect lifecycle. Calling stopStream here
            // closes Ktor's selector and makes the old RTMP client impossible to
            // restore after PiP. reTry keeps the encoders/camera alive and
            // reconnects the same YouTube session instead.
            boolean accepted = camera.getStreamClient().reTry(delayMs, reason);
            if (!accepted) {
                reconnectPending = false;
                sendConnectionFailed("YouTube connection interrupted. Retrying automatically: " + reason);
                postDelayed(() -> scheduleReconnect(reason), delayMs);
            }
        } catch (Exception error) {
            reconnectPending = false;
            sendConnectionFailed("YouTube connection interrupted. Retrying automatically: " + errorMessage(error));
            postDelayed(() -> scheduleReconnect(errorMessage(error)), delayMs);
        }
    }

    private boolean hasStreamingPermissions() {
        return ContextCompat.checkSelfPermission(reactContext, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
                && ContextCompat.checkSelfPermission(reactContext, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
    }

    private void sendStartResult(int requestId, boolean result, @Nullable String error) {
        WritableMap payload = Arguments.createMap();
        payload.putInt("requestId", requestId);
        payload.putBoolean("result", result);
        if (error != null) payload.putString("error", error);
        sendEvent("topStartStreaming", payload);
    }

    private void sendConnectionSuccess() {
        sendEvent("topConnectionSuccess", Arguments.createMap());
    }

    private void sendConnectionFailed(String reason) {
        WritableMap payload = Arguments.createMap();
        payload.putString("code", reason);
        sendEvent("topConnectionFailed", payload);
    }

    private void sendDisconnected() {
        sendEvent("topDisconnect", Arguments.createMap());
    }

    private void sendPermissionsDenied() {
        WritableMap payload = Arguments.createMap();
        WritableArray permissions = Arguments.createArray();
        permissions.pushString(Manifest.permission.CAMERA);
        permissions.pushString(Manifest.permission.RECORD_AUDIO);
        payload.putArray("permissions", permissions);
        sendEvent("topPermissionsDenied", payload);
    }

    private void sendEvent(String eventName, WritableMap payload) {
        post(() -> {
            if (getId() == NO_ID || released) return;
            reactContext.getJSModule(RCTEventEmitter.class).receiveEvent(getId(), eventName, payload);
        });
    }

    private void cancelPendingStart(String message) {
        if (pendingRequestId == 0) return;
        int requestId = pendingRequestId;
        clearPendingStart();
        sendStartResult(requestId, false, message);
    }

    private void clearPendingStart() {
        pendingRequestId = 0;
        pendingRtmpUrl = "";
        pendingStartRetried = false;
    }

    private static String trimTrailingSlash(String value) {
        int end = value.length();
        while (end > 0 && value.charAt(end - 1) == '/') end--;
        return value.substring(0, end);
    }

    private static String trimLeadingSlash(String value) {
        int start = 0;
        while (start < value.length() && value.charAt(start) == '/') start++;
        return value.substring(start);
    }

    private static String errorMessage(Exception error) {
        String message = error.getMessage();
        return message == null || message.trim().isEmpty() ? error.toString() : message;
    }

    @Override
    public void onConnectionStarted(String url) {
        reconnectPending = false;
        // Connection success is authoritative; merely opening the socket is not LIVE.
    }

    @Override
    public void onConnectionSuccess() {
        if (stopping || released) return;
        everConnected = true;
        reconnectPending = false;
        reconnectAttempts = 0;
        sendConnectionSuccess();
    }

    @Override
    public void onConnectionFailed(String reason) {
        if (stopping || released) return;
        reconnectPending = false;
        String failureReason = reason == null || reason.isEmpty() ? "Connection failed" : reason;
        sendConnectionFailed(failureReason);
        scheduleReconnect(failureReason);
    }

    @Override
    public void onNewBitrate(long bitrate) {
        // Reserved for a future native quality meter.
    }

    @Override
    public void onDisconnect() {
        if (suppressDisconnectCallback) return;
        if (stopping) sendDisconnected();
        else {
            String reason = everConnected ? "Disconnected" : "Disconnected before live";
            sendConnectionFailed(reason);
            scheduleReconnect(reason);
        }
    }

    @Override
    public void onAuthError() {
        if (stopping || released) return;
        sendConnectionFailed("YouTube authentication failed.");
    }

    @Override
    public void onAuthSuccess() {
        // Connection success follows after publish begins.
    }

    @Override
    public void surfaceCreated(SurfaceHolder holder) {
        surfaceReady = holder.getSurface() != null && holder.getSurface().isValid();
        if (surfaceReady && pendingRequestId != 0) postDelayed(this::runPendingStart, 300);
    }

    @Override
    public void surfaceChanged(SurfaceHolder holder, int format, int width, int height) {
        surfaceReady = holder.getSurface() != null && holder.getSurface().isValid();
    }

    @Override
    public void surfaceDestroyed(SurfaceHolder holder) {
        surfaceReady = false;
    }

    @Override
    public void onHostResume() {
        // Capture and RTMP stay owned by this view until End Stream is confirmed.
    }

    @Override
    public void onHostPause() {
        // Do not stop for PiP, app switching, notification shade, screen
        // transitions or a temporary host pause. Only stopStreamingExplicitly()
        // may end an active user stream while the app process is alive.
    }

    @Override
    public void onHostDestroy() {
        releaseView();
    }

    public void releaseView() {
        if (released) return;
        released = true;
        stopping = true;
        disablePictureInPicture();
        reconnectPending = false;
        cancelPendingStart("The streaming screen was closed.");
        suppressDisconnectCallback = true;
        stopAllInternal();
        suppressDisconnectCallback = false;
        previewView.getHolder().removeCallback(this);
        reactContext.removeLifecycleEventListener(this);
    }
}
