/**
 * Public halves of LAFINA's release keys; safe to commit. Written by
 * `npm run release:keygen`, which keeps the private halves outside the repo.
 *
 * UPDATE_PUBLIC_KEY checks the signed update manifest on GitHub.
 * RELEASE_APK_SIGNER_SHA256 is the release APK signing certificate's SHA-256:
 * `npm run release` refuses an APK signed with anything else, and the app
 * compares it with its own signer before offering an APK update.
 */
export const UPDATE_PUBLIC_KEY: string =
  'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEXnWlhmaDLoS51UnhB/N3kLXJt9DNZAA9LCFJ68kOX2k2ir+s2BnXk2wRiaHUdfzTruRhbPpnBpKB/Nk1JcLhnA==';

export const RELEASE_APK_SIGNER_SHA256: string =
  'c87209e987f87abc27a535c0be835ae4ff469052ea054018ff6654174902bdfe';
