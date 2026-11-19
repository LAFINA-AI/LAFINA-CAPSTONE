# Verification logs

The `.log.gz` files preserve the complete command output. Raw `.log` files remain in this local checkout and are ignored by Git to avoid committing multi-megabyte duplicate text. Early failed runs are retained as history; they are not represented as successful gates.

Primary evidence:

- `final-gates.log.gz`: `npm run preflight` — TypeScript, lint, full Jest (181 suites; 2,449 passed, one skipped), architecture.
- `accessibility-regression.log.gz`: 66 focused Skills/Alarms/Notes/To-do tests after final touch-target and filter-role adjustments.
- `delivery-lint.log.gz`, `delivery-typecheck.log.gz`, `delivery-architecture.log.gz`: final current-checkout static checks.
- `review-apk-final.log.gz`: standalone ARM64 build plus 101 native JUnit tests.
- `delivery-apk.log.gz`: standalone ARM64 packaging after the final accessibility adjustments.
- `followup-skills-tests.log.gz`: clean 33-test Skills/theme checkpoint; later prompt/job tests are included in final gates.
- `essential-regression.log.gz`: 42 targeted existing essential-page tests.

For exact completed outcomes and the APK checksum, read `../verification.json`. Android XML reports are local build output in `android/app/build/test-results/testDebugUnitTest/`; no phone result is inferred from them.

To inspect a compressed log with Python:

```powershell
python -c "import gzip; print(gzip.open('docs/design/skills/logs/final-gates.log.gz', 'rt', encoding='utf-8-sig').read())"
```

Full-suite logs contain pre-existing React `act` diagnostics and deliberate error-path output. Android logs retain dependency/deprecation/environment warnings. No device console, native screenshot, signed-in production AI response or hardware benchmark was recorded.
