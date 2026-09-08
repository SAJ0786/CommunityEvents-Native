# Android streaming UI review — 8 September 2026

Status: code rectified and source-level regression tests passed; new binary and physical-device verification pending. No build submitted by the agent.

## User report and findings

Android broadcast continues in system Picture in Picture (PiP), but the first expansion can lose the bottom camera/microphone/end controls. Ending can reveal the initial streaming screen behind/over the app.

- The 4.2-second controls hide timer was not cancelled/restored by system PiP transitions. Only in-app minimisation changed React state. MainActivity did not forward PiP mode changes to the streaming UI.
- End explicitly selected the initial `method` screen after stopping the camera, before waiting for the backend to complete. This exposed setup during shutdown.
- The parent unconditionally assigned stream updates to the open streaming event. A late update could reopen an already dismissed streaming surface.
- Native view manager already calls `releaseView()` on removal; this releases preview/capture and unregisters its listeners. No camera/encoder/orientation changes were necessary for these UI fixes. The reported transparent visual artifact was not reproduced directly.

## Rectifications

- MainActivity forwards the Android PiP mode callback. A native state query on mount/focus covers missed events; stale query responses cannot override newer events.
- Entering PiP clears the hide timer and hides controls. Expanding restores controls immediately and leaves them visible until the next user interaction. The same native camera view remains mounted throughout.
- A late PiP-entry failure cannot minimise a stream that has already ended.
- Confirmed End is single-flight. An opaque closing screen covers the camera's existing settling interval and backend completion; setup is never shown during shutdown.
- Backend failure presents Retry End Stream for the same session, with phone PiP disabled and no camera restart.
- Dismissal unmounts the streaming surface. Late stream updates still refresh event lists but cannot reopen a closed/different stream panel. Connection/control timers are cleared on unmount.
- Diagnostics include `STREAM_ANDROID_PIP_UI_CHANGED` with the `entered` flag.

Android PiP UI handling follows the platform mode-change callback described in [Android's PiP documentation](https://developer.android.com/develop/ui/views/picture-in-picture).

## Verification performed

- `npm.cmd run check`
- `npm.cmd run test:regressions`: repeated PiP cycles/control timer cancellation, delayed minimise after End, duplicate End, pending/failed backend, retry against the same session, late native callbacks, and closed-parent updates; previous picker, approval, native version metadata, and iOS patch/codegen checks retained.
- `git diff --check`
- Connected S22 reports Android app version 1.0.0, versionCode 58. Filtered retained StreamingPip/ReactNativeJS/AndroidRuntime logs returned no matching streaming/PiP errors. This is not evidence that the new fix is device-tested.
- No Gradle, EAS or Codemagic build run; native compilation and physical-device rendering remain to be checked in the user's next build.

## Next-build acceptance checks

1. Start a test stream and confirm YouTube receives it. Wait until controls hide, enter system PiP, then expand once. Camera/Mute/End must be visible without a second cycle.
2. Repeat at least five times in portrait and landscape. Confirm the same stream continues, orientation is unchanged, and controls work after each expansion.
3. Disable PiP in Android settings. Use the in-app minimise/restore path and confirm controls still return.
4. Confirm End once. Only the closing screen should appear before returning to the app: no setup chooser, transparent camera residue, or second End required. Swiping Home after End must not trigger PiP.
5. With a controlled network interruption during End, confirm the retry screen targets the same session and does not restart capture or enable PiP. Restore the network and retry.
6. Open a second stream setup after the first closes; it must be a fresh panel with no old session UI. Retest the shared close/retry flow on iOS separately; this change does not claim an iOS connection fix.
