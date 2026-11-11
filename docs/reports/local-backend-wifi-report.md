# Local backend over Wi-Fi — 2026-11-11

Owner request: use local backend APIs without keeping the phone plugged in.

Implemented editable private IPv4/port under Profile > Server (debug) > Set local Wi-Fi address, saved device-locally and restored on restart. Server switches retain the existing account-sign-out boundary. Release builds ignore this setting. The dataQa variant permits HTTP for LAN development; release retains HTTPS-only behavior. The local server now defaults to 0.0.0.0:8000; LAFINA_LOCAL_HOST can restore loopback-only binding.

Active PC endpoint: http://192.168.100.4:8000 (Ethernet on the same LAN as phone Wi-Fi 192.168.100.2). Phone Chrome displayed the /healthz development JSON over this address. This is LAN access; no adb reverse or public forwarding is used for the HTTP connection. PC-side health returned HTTP 200. The server is running hidden; after PC restart, run npm run providers:server.

Validation: TypeScript passed; ESLint passed; 16 backend selection tests passed (including persistence and invalid/private address cases). APK build/install receipts are in .local/wifi-apk-build.log and .local/call-lafina-update/. Screenshot of phone LAN health is .local/wifi-check.png. No paid provider request was made for this check.

A narrow Private-profile firewall rule was attempted but Windows denied administrator access. No firewall rule was changed; the existing network configuration already allowed the verified phone connection.

Manual: finish personal setup if needed, open Profile > Server (debug), set http://192.168.100.4:8000, save/use local, sign into a local-server account if required, and unplug USB. Keep the PC/backend running and both devices on the same LAN. If DHCP changes the PC address, update this field or reserve its address in the router. Local-server and Vercel accounts are separate. Live ElevenLabs custom-LLM callbacks still need separately configured provider reachability; LAN access alone does not publish the backend to ElevenLabs.

STATUS: AWAITING DEVICE VALIDATION — LAN health verified; complete authenticated API use after saving the address remains a manual check.

Both updated APKs were installed in place successfully (adb install -r); no uninstall or app-data clear. Build and configured-provider-key audit passed for both. Local guest onboarding remains for the user to complete; the saved Wi-Fi endpoint can then be set under Profile.
