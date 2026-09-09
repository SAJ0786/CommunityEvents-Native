# Firebase Test Lab Robo scripts

These scripts move Robo beyond the module-entry screen before the normal automated crawl begins.

## Android authenticated test

The authenticated script is generated locally so the Firebase test phone number and fixed verification code are never committed to Git.

From PowerShell in the project directory:

```powershell
$env:CCA_TEST_PHONE = "+614XXXXXXXX"
$env:CCA_TEST_VERIFICATION_CODE = "123456"
npm.cmd run testlab:robo-script
```

Upload `community-events-authenticated.generated.json` in the Firebase Test Lab Robo test advanced options. The generated file is ignored by Git. Clear the temporary environment values afterwards:

```powershell
Remove-Item Env:CCA_TEST_PHONE
Remove-Item Env:CCA_TEST_VERIFICATION_CODE
```

Use a test timeout of at least five minutes. The script signs in, asserts that the authenticated Home tab is present, captures a screenshot, and then hands control back to the normal Robo crawler.

The APK must include the accessibility labels added with this script. Older APKs might not expose stable identifiers for the consent switch and phone fields.

## App Check for device-farm APKs

The `apk`, `preview` and `development` EAS profiles intentionally use Firebase
App Check's debug provider because Play Integrity requires Play Store
distribution. Before building a repeatable Firebase Test Lab or AWS Device Farm
APK:

1. In Firebase Console, open **App Check > Apps**.
2. Open the menu for **Community Events Android Native** and select
   **Manage debug tokens**.
3. Generate one revocable token for device-farm testing.
4. Save it in the EAS **preview** environment as the protected variable
   `FIREBASE_APP_CHECK_DEBUG_TOKEN`.

Do not paste the token into `eas.json`, a Robo script, test report or Git. The
`ios-personal-testflight` and `production` profiles ignore debug mode and use
App Attest with DeviceCheck fallback on Apple devices or Play Integrity on
Android.

Keep Firestore, Storage and Authentication enforcement in **Monitoring** until
new builds show verified requests from every supported platform. Test failures
must be fixed before enabling enforcement.

## iOS and guest test

Upload `community-events-guest.json` for an iOS or Android guest crawl. It enters Community Events, verifies that the Home tab is present, captures a screenshot, and then lets Robo explore.

Firebase Robo for iOS does not currently support text-entry actions. Consequently, phone-number authentication on iOS requires an XCTest/XCUITest or a separately provisioned authenticated test state; do not put a phone number or verification code in the guest script.
