# Trappist

We're doing it live!

## Running unit tests

### Locally

Chrome must be available. On the dev machine, point `CHROME_BIN` at the binary:

```bash
CHROME_BIN=/usr/bin/google-chrome-stable npm test -- --watch=false --no-progress
```

Drop `--watch=false` to keep Karma running and re-run tests on file changes during development.

### In CI (GitHub Actions)

The `test` job in the workflow installs Chromium, runs the suite once, and must pass before the build proceeds. To run the same command manually in any Ubuntu-like environment:

```bash
npm ci
npx ng test --watch=false --no-progress --browsers=ChromeHeadless
```
