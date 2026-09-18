# Build verification — 1.2.8

## Passed in this environment
- `npm run validate`
- `npm test`
- `node --check app.js`
- `node --check sw.js`
- security scan for API keys / sensitive legacy release files
- core financial, migration, conflict and PWA static smoke tests

## Not executed in this environment
- `npm ci` with newly declared Capacitor/Vitest/Playwright dependencies: npm registry access was unavailable in the execution environment.
- `npx cap doctor`
- `npx cap sync android`
- Gradle Android build
- real-device Chrome Android / Safari iOS / Android 10/12/14 manual tests
- two-device Firebase live conflict tests
- GitHub Release creation

No APK is claimed as built or verified here.
