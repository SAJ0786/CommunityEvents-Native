import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import {
  findNodeHandle,
  PermissionsAndroid,
  Platform,
  requireNativeComponent,
  UIManager,
} from 'react-native';

const VIEW_NAME = 'AndroidRootEncoderLiveStreamView';
const NativeRootEncoderView = requireNativeComponent(VIEW_NAME);

const AndroidRootEncoderLiveStreamView = forwardRef(({
  style,
  camera = 'back',
  isMuted = false,
  orientation = 'portrait',
  onConnectionSuccess,
  onConnectionFailed,
  onDisconnect,
  onPermissionsDenied,
}, forwardedRef) => {
  const nativeRef = useRef(null);
  const nextRequestId = useRef(1);
  const requestMap = useRef(new Map());
  const startGeneration = useRef(0);

  const dispatchCommand = (name, args = []) => {
    const node = findNodeHandle(nativeRef.current);
    const config = UIManager.getViewManagerConfig(VIEW_NAME);
    const command = config?.Commands?.[name];
    if (!node || command == null) throw new Error('The Android native camera is not mounted.');
    UIManager.dispatchViewManagerCommand(node, command, args);
  };

  useImperativeHandle(forwardedRef, () => ({
    startStreaming: async (streamKey, url) => {
      const generation = ++startGeneration.current;
      if (Platform.OS !== 'android') throw new Error('Android RootEncoder is only available on Android.');
      const permissions = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.CAMERA,
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      ]);
      const denied = Object.entries(permissions)
        .filter(([, result]) => result !== PermissionsAndroid.RESULTS.GRANTED)
        .map(([permission]) => permission);
      if (generation !== startGeneration.current) throw new Error('Streaming was stopped.');
      if (denied.length) {
        onPermissionsDenied?.(denied);
        throw new Error('Camera and microphone permissions are required.');
      }

      const requestId = nextRequestId.current++;
      const promise = new Promise((resolve, reject) => {
        requestMap.current.set(requestId, { resolve, reject });
      });
      try {
        dispatchCommand('startStreaming', [requestId, streamKey, url || null]);
      } catch (error) {
        requestMap.current.delete(requestId);
        throw error;
      }
      return promise;
    },
    stopStreaming: () => {
      startGeneration.current += 1;
      dispatchCommand('stopStreaming');
      for (const pending of requestMap.current.values()) {
        pending.reject(new Error('Streaming was stopped.'));
      }
      requestMap.current.clear();
    },
    setZoomRatio: () => {},
  }), [onPermissionsDenied]);

  return (
    <NativeRootEncoderView
      ref={nativeRef}
      style={style}
      camera={camera}
      isMuted={isMuted}
      orientation={orientation}
      onStartStreaming={event => {
        const { requestId, result, error } = event.nativeEvent || {};
        const pending = requestMap.current.get(requestId);
        if (!pending) return;
        requestMap.current.delete(requestId);
        if (result) pending.resolve(true);
        else pending.reject(new Error(error || 'The Android camera could not start streaming.'));
      }}
      onConnectionSuccess={() => onConnectionSuccess?.()}
      onConnectionFailed={event => onConnectionFailed?.(event.nativeEvent?.code || 'unknown')}
      onDisconnect={() => onDisconnect?.()}
      onPermissionsDenied={event => onPermissionsDenied?.(event.nativeEvent?.permissions || [])}
    />
  );
});

export default AndroidRootEncoderLiveStreamView;
