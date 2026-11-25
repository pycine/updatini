# Security policy

Updatini is an administrative console for publishing firmware. Treat its admin token and deployment configuration with care.

## Supported versions

Only the latest commit on `main` is supported. Fixes are made on `main`.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting instead of opening a public issue:

**https://github.com/pycine/updatini/security/advisories/new**

Include:

- what the issue is and where it lives (file/route)
- steps to reproduce or a proof of concept
- the impact you believe it has
- any suggested fix

Do not include real admin tokens, Cloudflare credentials, firmware bundles, or personal data in a report. Revoke or rotate any secret that may have been exposed.

You can expect an acknowledgement within a few days. Please keep the report private until a fix is released.

## Admin token

- The API is protected by a single bearer token stored as the Worker secret `ADMIN_TOKEN`.
- Rotate the token immediately if it has been exposed:

  ```bash
  npm run token
  ```

  This overwrites the secret; the old token stops working immediately.
- The token is never read from a file at runtime and is never stored in the repository. For local development it lives in `.dev.vars`, which is ignored by Git.
- The browser stores the token in `sessionStorage` for the current tab only.
- Losing the token is recoverable: generate a new one. The previous value cannot be retrieved from Cloudflare.

## Deployment hardening

For a production deployment, consider adding:

- **Cloudflare Access** in front of the console so only your identity provider can reach it
- rate limiting or WAF rules on `/api/*`
- a scheduled token rotation process
- branch/environment separation (for example `wrangler deploy --env staging`)

The UI is public by design; only `/api/*` requires the token. Firmware bundles in R2 are private and are not exposed by any download route in this repository.
