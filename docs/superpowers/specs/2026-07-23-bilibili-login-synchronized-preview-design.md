# Bilibili Login and Synchronized Preview Design

## Goal

Extend the sandboxed `guyantools.bilibili-media` plugin with Bilibili QR-code
login for member-only stream selection, and make the separate DASH video and
audio previews behave as one player.

## Scope

- Generate a Bilibili web QR login request and poll its status.
- Store the resulting Bilibili cookie bundle as an encrypted plugin secret.
- Let the host inject that secret only for explicitly bound HTTPS origins.
- Use the authenticated request path for Bilibili API resolution and preview
  proxying.
- Show login state and provide a logout action that deletes the saved secret.
- Synchronize the separate video and audio preview elements.

The host remains site-neutral. Bilibili endpoints, QR polling, cookie parsing,
quality selection, and UI wording remain in the plugin.

## Login Flow

1. The plugin requests a QR payload from Bilibili's official web QR endpoint.
2. The page renders the returned URL with a locally bundled QR encoder. No QR
   content is sent to a third-party image service.
3. The plugin polls Bilibili with the returned `qrcode_key` until success,
   expiry, cancellation, or a network failure.
4. On success, the plugin extracts the login cookie bundle from Bilibili's
   response URL and stores it under a plugin-private secret key.
5. The page receives only a sanitized status: `logged-out`, `waiting`,
   `logged-in`, `expired`, or `error`. It never renders the cookie value.
6. Logout cancels outstanding polling, deletes the secret, clears displayed
   account state, and returns the page to `logged-out`.

The plugin manifest adds `secrets.self`. The marketplace entry must be updated
to exactly match the new manifest permissions and release tag.

## Credential Boundary

`network.fetch` continues to reject raw `Cookie` and `Set-Cookie` headers.
The host gains a generic credential reference on network and media-preview
requests:

```ts
credential?: {
  secretKey: string
  allowedOrigins: string[]
  headerName: 'Cookie'
}
```

At runtime, the host resolves the secret for the calling plugin only. It
injects the requested header only when the request URL has an HTTPS origin in
`allowedOrigins`; otherwise it fails with a credential-origin error. Response
headers never expose the secret.

The Bilibili plugin binds its credential to Bilibili API and media origins.
Authenticated API calls request the highest supported `qn`/`fnval` values; the
returned stream list remains the single source of truth for the quality menus.
The same credential reference is passed to the generic preview proxy so
member-only streams can be previewed without exposing a raw cookie to the
media element.

## Synchronized Preview

Video is the master clock because Bilibili DASH video has no embedded audio.
A small plugin-local synchronizer owns all event listeners and has a guard to
avoid feedback loops.

- Playing either element seeks the peer to the source time and starts it.
- Pausing either element pauses the peer.
- Seeking either element mirrors the target time to the peer.
- Ending one element stops the other at the terminal position.
- During playback, drift is corrected only when it exceeds 250 ms.
- Changing video or audio quality captures current time and play state,
  replaces both preview grants, waits for metadata, restores the time, then
  resumes only if playback was active.

The native media controls remain visible. The audio control remains available
for volume adjustment while its transport state is synchronized with video.

## Error Handling

- Expired or denied QR requests show an actionable retry state and never erase
  an existing valid login until a replacement login succeeds.
- An invalid or expired saved credential is removed after an authentication
  failure, then the resolver falls back to the signed-out quality list.
- Login cancellation leaves existing media selection and downloads untouched.
- Failure to start the peer player pauses the initiating element and presents a
  preview error rather than allowing desynchronized playback.

## Tests and Verification

Tests are added before implementation for:

1. Credential references inject a secret for an allowed origin and reject a
   non-bound origin or non-HTTPS URL.
2. Raw cookie headers remain rejected by normal network calls.
3. QR response parsing, pending/expired/success states, encrypted secret
   storage, and logout deletion.
4. Logged-in resolution attaches the credential reference and returns the
   higher-quality stream list supplied by Bilibili.
5. Play, pause, seeking, ended, and drift-correction synchronization using
   fake media elements.
6. Quality changes retain media position and playback state after replacement
   previews become ready.

Final verification includes targeted desktop/plugin tests, desktop application
build, plugin build, marketplace manifest/catalog consistency, and a live QR
and synchronized-preview check using the normal Electron startup path.
