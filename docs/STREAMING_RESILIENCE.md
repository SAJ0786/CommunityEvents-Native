# Streaming resilience

## Implemented behaviour

- An active phone-camera stream can be minimised without unmounting the native camera view.
- A floating live tile remains available throughout the Events and Business Directory modules and restores the streaming screen.
- The screen is kept awake while phone-camera streaming is active.
- Connection failure or disconnection changes the local state to interrupted and exposes Resume Same Stream and End Live Stream actions.
- The selected portrait or landscape orientation remains locked until the stream screen is closed safely.

## Platform limitation

The installed `@api.video/react-native-livestream` SDK stops camera capture when its view or app enters the background. Therefore, switching to another app, locking the device, or accepting a call can interrupt phone-camera capture. The app keeps the existing YouTube session identifier and reconnects to that same session when the broadcaster selects Resume Same Stream. It does not create a replacement broadcast.

External YouTube streams are unaffected because capture occurs on another device.

## Agreed scope

Background camera streaming is not required. Device testing should confirm same-session recovery after an incoming call, app switching, screen locking and temporary network loss.
