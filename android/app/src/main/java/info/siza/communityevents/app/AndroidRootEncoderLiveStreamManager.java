package info.siza.communityevents.app;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.common.MapBuilder;
import com.facebook.react.uimanager.SimpleViewManager;
import com.facebook.react.uimanager.ThemedReactContext;
import com.facebook.react.uimanager.annotations.ReactProp;

import java.util.Map;

public final class AndroidRootEncoderLiveStreamManager
        extends SimpleViewManager<AndroidRootEncoderLiveStreamView> {
    public static final String NAME = "AndroidRootEncoderLiveStreamView";
    private static final int COMMAND_START = 1;
    private static final int COMMAND_STOP = 2;

    @NonNull
    @Override
    public String getName() {
        return NAME;
    }

    @NonNull
    @Override
    protected AndroidRootEncoderLiveStreamView createViewInstance(@NonNull ThemedReactContext reactContext) {
        return new AndroidRootEncoderLiveStreamView(reactContext);
    }

    @ReactProp(name = "orientation")
    public void setOrientation(AndroidRootEncoderLiveStreamView view, @Nullable String orientation) {
        view.setStreamOrientation(orientation);
    }

    @ReactProp(name = "camera")
    public void setCamera(AndroidRootEncoderLiveStreamView view, @Nullable String camera) {
        view.setCameraFacing(camera);
    }

    @ReactProp(name = "isMuted", defaultBoolean = false)
    public void setMuted(AndroidRootEncoderLiveStreamView view, boolean muted) {
        view.setMuted(muted);
    }

    @Nullable
    @Override
    public Map<String, Integer> getCommandsMap() {
        return MapBuilder.of(
                "startStreaming", COMMAND_START,
                "stopStreaming", COMMAND_STOP
        );
    }

    @Override
    public void receiveCommand(
            @NonNull AndroidRootEncoderLiveStreamView root,
            int commandId,
            @Nullable ReadableArray args
    ) {
        if (commandId == COMMAND_START) {
            if (args == null || args.size() < 3) return;
            root.startStreaming(args.getInt(0), args.getString(1), args.isNull(2) ? null : args.getString(2));
        } else if (commandId == COMMAND_STOP) {
            root.stopStreamingExplicitly();
        }
    }

    @Nullable
    @Override
    public Map<String, Object> getExportedCustomDirectEventTypeConstants() {
        MapBuilder.Builder<String, Object> builder = MapBuilder.builder();
        builder.put("topStartStreaming", MapBuilder.of("registrationName", "onStartStreaming"));
        builder.put("topConnectionSuccess", MapBuilder.of("registrationName", "onConnectionSuccess"));
        builder.put("topConnectionFailed", MapBuilder.of("registrationName", "onConnectionFailed"));
        builder.put("topDisconnect", MapBuilder.of("registrationName", "onDisconnect"));
        builder.put("topPermissionsDenied", MapBuilder.of("registrationName", "onPermissionsDenied"));
        return builder.build();
    }

    @Override
    public void onDropViewInstance(@NonNull AndroidRootEncoderLiveStreamView view) {
        view.releaseView();
        super.onDropViewInstance(view);
    }
}
