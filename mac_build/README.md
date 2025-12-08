# How to notarize Application

## Requirements
- Apple Developer Account 
    - (Create a app-specific password)[https://account.apple.com/account/manage]
- Have a Developer ID Application Certificate
    - Only able to be issued by the Apple Developer Account Holder.
    - Add it to Keychain Access by Double Clicking it
- Download and install the Apple WWDRCA G3 certificate to certify the certificate
    - Download here: https://www.apple.com/certificateauthority/AppleWWDRCAG3.cer
    - Install with `security add-trusted-cert -d -r unspecified -k ~/Library/Keychains/login.keychain-db ~/Downloads/AppleWWDRCAG3.cer`
    - Verify it works by running `security find-identity -v -p codesigning`
        - This should return >0 valid identities found.

## Steps
1. Copy `.env.example` to `.env`.
2. Add all required values.
3. Build, sign and notarize application by running `npm run package:mac` from the root directory.
