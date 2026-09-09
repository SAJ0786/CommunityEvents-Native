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

## iOS and guest test

Upload `community-events-guest.json` for an iOS or Android guest crawl. It enters Community Events, verifies that the Home tab is present, captures a screenshot, and then lets Robo explore.

Firebase Robo for iOS does not currently support text-entry actions. Consequently, phone-number authentication on iOS requires an XCTest/XCUITest or a separately provisioned authenticated test state; do not put a phone number or verification code in the guest script.
