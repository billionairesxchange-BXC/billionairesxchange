# Wallet database

The wallet API requires PostgreSQL. Create a dedicated database and apply
`migrations/001_wallet_accounts.sql` before deploying the API. Set
`DATABASE_URL` to a TLS-protected connection string in production.

The migration stores account password verifiers, hashed email/session/pairing
tokens, provider connection metadata, portfolio snapshots, and NFT metadata.
It does not store wallet recovery phrases, private keys, or exchange API
secrets. Existing Firebase users can use the **Move existing account** flow on
`wallet-connect.html`: sign in to the verified Firebase account and establish a
new BXC Wallet password. Firebase password hashes cannot be exported, so this
is a password reset/re-enrollment rather than a silent password migration.
Other existing website pages continue to use Firebase Auth until they are
migrated separately.

The QR login is a short-lived, one-use challenge. Apply
`migrations/002_wallet_pairing_origin.sql` after the initial schema migration.
The website holds a separate polling secret, the API stores only token hashes,
and the challenge is bound to the requesting website origin. The mobile app
checks that origin against `EXPO_PUBLIC_WEBSITE_URL` and asks for explicit
approval before the API grants a website session. The authenticated dashboard
endpoint (`GET /api/mobile/dashboard`) returns the wallet profile, provider
connection metadata, latest portfolio snapshots, and NFT records in one
response. Existing individual read endpoints remain available.

Trading-provider OAuth/API-key authorization and live synchronization are not
enabled by this scaffold. Do not collect provider credentials until a server
side encrypted secret store, key rotation, and provider-specific authorization
flows have been configured and reviewed.
