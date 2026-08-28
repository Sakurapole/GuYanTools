# Bilibili Login and Synchronized Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add QR-code login for member stream selection and keep the plugin's DASH video and audio previews synchronized.

**Architecture:** The desktop host adds a site-neutral credential reference that resolves an encrypted plugin secret only for approved HTTPS origins. The Bilibili plugin owns QR polling, cookie extraction, quality resolution, and a local media synchronizer. The page receives login state but never displays a credential value.

**Tech Stack:** Electron protocol/IPC, TypeScript, Vitest, Bilibili web QR API, locally bundled `qrcode` encoder, plugin marketplace Git releases.

---

### Task 1: Define a Host Credential Reference

**Files:**
- Modify: `desktop/src/contracts/plugin_media.ts`
- Modify: `desktop/src/contracts/plugin_host.ts`
- Modify: `packages/plugin-sdk/src/contracts.ts`
- Modify: `packages/plugin-sdk/src/runtime.ts`
- Test: `desktop/src/main/plugin-host/services/network_service.test.ts`

- [ ] **Step 1: Write the failing contract/service test**

```ts
it('injects a plugin secret only for an allowed HTTPS origin', async () => {
  const secret = vi.fn(async () => 'SESSDATA=member-cookie');
  const fetcher = vi.fn(async () => new Response('{}'));
  const service = new NetworkService(secret, fetcher);

  await service.fetch('plugin.one', {
    url: 'https://api.bilibili.com/x/player/playurl',
    credential: { secretKey: 'bilibili.session', allowedOrigins: ['https://api.bilibili.com'] },
  });

  expect(secret).toHaveBeenCalledWith('plugin.one', 'bilibili.session');
  expect(new Headers(fetcher.mock.calls[0][1]?.headers).get('Cookie')).toBe('SESSDATA=member-cookie');
  await expect(service.fetch('plugin.one', {
    url: 'https://example.com',
    credential: { secretKey: 'bilibili.session', allowedOrigins: ['https://api.bilibili.com'] },
  })).rejects.toThrow('PLUGIN_NETWORK_CREDENTIAL_ORIGIN_DENIED');
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm --dir desktop exec vitest run src/main/plugin-host/services/network_service.test.ts`

Expected: FAIL because `NetworkRequest.credential` and the plugin-scoped NetworkService API do not exist.

- [ ] **Step 3: Add the shared type and SDK forwarding**

```ts
export interface PluginCredentialReference {
  secretKey: string;
  allowedOrigins: string[];
  headerName?: 'Cookie';
}

export interface NetworkRequest {
  // existing fields
  credential?: PluginCredentialReference;
}
```

Keep `createPluginApi().network.fetch` as a direct typed pass-through, so no UI-specific behavior is added to the SDK.

- [ ] **Step 4: Implement guarded network injection**

```ts
type SecretReader = (pluginId: string, key: string) => Promise<string | null>;

async fetch(pluginId: string, input: NetworkRequest): Promise<NetworkResponse> {
  const url = validateWebUrl(input.url);
  const headers = copyNonSensitiveHeaders(input.headers);
  if (input.credential) {
    assertAllowedOrigin(url, input.credential.allowedOrigins);
    const value = await this.secretReader(pluginId, input.credential.secretKey);
    if (!value) throw new Error('PLUGIN_NETWORK_CREDENTIAL_UNAVAILABLE');
    headers.set(input.credential.headerName ?? 'Cookie', value);
  }
  return this.performFetch(url, headers, input);
}
```

`assertAllowedOrigin` compares normalized `URL.origin` values, requires HTTPS, rejects an empty allowlist, and does not allow a raw `Cookie` header to coexist with a credential reference.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run: `pnpm --dir desktop exec vitest run src/main/plugin-host/services/network_service.test.ts`

Expected: PASS, including the existing raw-cookie rejection test.

### Task 2: Apply Credentials to the Media Preview Proxy

**Files:**
- Modify: `desktop/src/main/plugin-host/services/media_service.ts`
- Modify: `desktop/src/main/plugin-host/services/media_service.test.ts`
- Modify: `desktop/src/main/plugin-host/host_services.ts`
- Modify: `desktop/src/main/plugin-host/ipc.ts`
- Modify: `desktop/src/contracts/plugin_host.ts`
- Modify: `packages/plugin-sdk/src/contracts.ts`
- Modify: `packages/plugin-sdk/src/runtime.ts`

- [ ] **Step 1: Write the failing preview credential test**

```ts
it('adds the referenced plugin credential to preview range requests', async () => {
  const service = new MediaService(grants, vi.fn(), fetcher, async () => 'SESSDATA=member-cookie');
  const preview = await service.createPreview('plugin.one', 'https://cdn.bilibili.com/video.m4s', 'video/mp4', {
    Referer: 'https://www.bilibili.com/',
  }, { secretKey: 'bilibili.session', allowedOrigins: ['https://cdn.bilibili.com'] });

  await service.handlePreviewRequest(new Request(preview.url, { headers: { Range: 'bytes=0-1' } }));
  expect(forwardedHeaders[0].get('Cookie')).toBe('SESSDATA=member-cookie');
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm --dir desktop exec vitest run src/main/plugin-host/services/media_service.test.ts`

Expected: FAIL because preview grants cannot retain a credential reference.

- [ ] **Step 3: Extend preview grants without exposing secrets**

```ts
async createPreview(
  pluginId: string,
  sourceUrl: string,
  mimeType?: string,
  headers?: Record<string, string>,
  credential?: PluginCredentialReference,
): Promise<PreviewGrant>
```

Store the reference in the private preview record, validate its origin against `sourceUrl` when creating the grant, and resolve the secret only inside `handlePreviewRequest`. Keep `PreviewGrant` returned to plugins unchanged: it contains no credential data.

- [ ] **Step 4: Wire plugin identity from IPC to services**

Construct `NetworkService` and `MediaService` in `HostServiceRegistry` with a shared secret-reader closure calling `SecretService.get`. Pass the runtime plugin ID to `network.fetch`; pass the optional credential parameter from `plugin-runtime:media:preview` to `MediaService.createPreview`.

- [ ] **Step 5: Run focused host tests and verify GREEN**

Run: `pnpm --dir desktop exec vitest run src/main/plugin-host/services/network_service.test.ts src/main/plugin-host/services/media_service.test.ts`

Expected: PASS with range, Referer, MIME, credential injection, and origin-denial coverage.

### Task 3: Build Plugin QR Authentication

**Files:**
- Create: `../guyantools-bilibili-media/src/domain/bilibili_auth.ts`
- Create: `../guyantools-bilibili-media/tests/bilibili_auth.test.ts`
- Modify: `../guyantools-bilibili-media/src/domain/bilibili_resolver.ts`
- Modify: `../guyantools-bilibili-media/src/ui/plugin_api.d.ts`
- Modify: `../guyantools-bilibili-media/src/ui/main.ts`
- Modify: `../guyantools-bilibili-media/src/ui/index.html`
- Modify: `../guyantools-bilibili-media/guyantools.plugin.json`
- Modify: `../guyantools-bilibili-media/package.json`

- [ ] **Step 1: Write failing QR/auth tests**

```ts
it('persists only the cookie pair string after QR login succeeds', async () => {
  const api = fakeAuthApi({
    poll: { code: 0, data: { code: 0, url: 'https://passport.bilibili.com/?SESSDATA=abc&bili_jct=csrf' } },
  });
  const auth = new BilibiliAuth(api);

  const state = await auth.poll('qr-key');
  expect(state).toEqual({ status: 'logged-in' });
  expect(api.secrets.set).toHaveBeenCalledWith('bilibili.session', 'SESSDATA=abc; bili_jct=csrf');
});

it('uses the Bilibili credential reference for authenticated resolution', async () => {
  await new BilibiliResolver(loggedInApi).resolve('BV1ab411c7mD');
  expect(loggedInApi.network.fetch).toHaveBeenCalledWith(expect.objectContaining({
    credential: expect.objectContaining({ secretKey: 'bilibili.session' }),
  }));
});
```

- [ ] **Step 2: Run the plugin domain tests and verify RED**

Run: `pnpm test -- bilibili_auth.test.ts bilibili_domain.test.ts`

Expected: FAIL because `BilibiliAuth`, the secret API, and credentialed resolver requests do not exist.

- [ ] **Step 3: Add the auth state machine**

`BilibiliAuth` owns `start`, `poll`, `getStatus`, and `logout`:

```ts
const QR_GENERATE_URL = 'https://passport.bilibili.com/x/passport-login/web/qrcode/generate';
const QR_POLL_URL = 'https://passport.bilibili.com/x/passport-login/web/qrcode/poll';
const SESSION_SECRET_KEY = 'bilibili.session';

async logout() {
  await this.api.secrets.delete(SESSION_SECRET_KEY);
  return { status: 'logged-out' } as const;
}
```

Map Bilibili's pending, scanned, expired, and success codes to sanitized plugin states. Extract only `SESSDATA`, `bili_jct`, `DedeUserID`, and `buvid3` query parameters, URL-decode their values, and serialize them as a Cookie header. Never log the URL or cookie string.

- [ ] **Step 4: Integrate authentication into resolver requests**

When `secrets.get(SESSION_SECRET_KEY)` reports a stored value, attach:

```ts
const credential = {
  secretKey: SESSION_SECRET_KEY,
  allowedOrigins: ['https://api.bilibili.com', 'https://passport.bilibili.com'],
};
```

to Bilibili API calls. On a Bilibili authentication failure, delete the saved credential and retry resolution once without it so the user still gets public streams.

- [ ] **Step 5: Add the page controls and local QR rendering**

Add `qrcode` and `@types/qrcode` to the plugin development dependencies. Render QR content to a canvas or data URL locally. The UI starts a polling interval only while the QR dialog is open, clears it on success/expiry/cancel/unload, and exposes logout. Add `secrets.self` to the manifest.

- [ ] **Step 6: Run plugin auth/domain tests and verify GREEN**

Run: `pnpm test -- bilibili_auth.test.ts bilibili_domain.test.ts`

Expected: PASS with QR state, cookie filtering, secret deletion, and authenticated resolver request coverage.

### Task 4: Synchronize the Two Media Elements

**Files:**
- Create: `../guyantools-bilibili-media/src/ui/media_synchronizer.ts`
- Create: `../guyantools-bilibili-media/tests/media_synchronizer.test.ts`
- Modify: `../guyantools-bilibili-media/src/ui/main.ts`

- [ ] **Step 1: Write failing synchronization tests**

```ts
it('mirrors a video seek and play into the audio stream', async () => {
  const video = new FakeMediaElement(32);
  const audio = new FakeMediaElement(0);
  const synchronizer = new MediaSynchronizer(video, audio);

  video.emit('seeking');
  video.emit('play');

  expect(audio.currentTime).toBe(32);
  expect(audio.playCalls).toBe(1);
  synchronizer.dispose();
});

it('corrects playback drift only beyond 250 milliseconds', () => {
  const { video, audio, synchronizer } = createPair({ videoTime: 10, audioTime: 9.5 });
  video.emit('timeupdate');
  expect(audio.currentTime).toBe(10);
  synchronizer.dispose();
});
```

- [ ] **Step 2: Run the synchronizer test and verify RED**

Run: `pnpm test -- media_synchronizer.test.ts`

Expected: FAIL because `MediaSynchronizer` does not exist.

- [ ] **Step 3: Implement one guarded synchronizer**

```ts
export class MediaSynchronizer {
  private syncing = false;
  private readonly cleanups: Array<() => void> = [];

  private mirrorTime(source: HTMLMediaElement, target: HTMLMediaElement) {
    if (Math.abs(source.currentTime - target.currentTime) <= 0.25) return;
    this.syncing = true;
    target.currentTime = source.currentTime;
    this.syncing = false;
  }
}
```

Install symmetric `play`, `pause`, `seeking`, `ended`, and `timeupdate` listeners. A peer playback rejection pauses the initiator and calls the supplied error callback. `dispose` removes every listener.

- [ ] **Step 4: Integrate quality replacement**

Before replacing preview grants, capture `currentTime` and whether either element is playing. After both `loadedmetadata` events, seek both to the clamped saved time and resume only when playback had been active. Reuse a single synchronizer instance per page and dispose it during `beforeunload`.

- [ ] **Step 5: Run synchronization and full plugin tests**

Run: `pnpm test`

Expected: PASS, including all existing media pipeline, UI request, worker, packaging, auth, and synchronizer tests.

### Task 5: Build, Release, and Live Verify

**Files:**
- Modify: `../guyantools-bilibili-media/guyantools.plugin.json`
- Modify: `../guyantools-bilibili-media/package.json`
- Modify: `../guyantools-plugin-marketplace/catalog.json`

- [ ] **Step 1: Bump plugin release metadata**

Set the plugin version to the next patch version (`0.2.5`) in `package.json` and `guyantools.plugin.json`. Rebuild `dist` and ensure the manifest declares `secrets.self`.

- [ ] **Step 2: Run static verification**

Run:

```powershell
pnpm --dir desktop exec vitest run src/main/plugin-host/services/network_service.test.ts src/main/plugin-host/services/media_service.test.ts
pnpm --dir packages/plugin-sdk build
pnpm --dir desktop run build:app
pnpm build
pnpm test
```

Expected: all commands exit 0. Record unrelated existing type errors separately if they prevent the desktop typecheck.

- [ ] **Step 3: Publish the plugin and marketplace catalog**

Commit and push only the plugin repository changes, tag `v0.2.5`, then update the marketplace entry with the matching version, requested permissions, tag, and resolved commit. Commit and push the marketplace change. Do not commit the dirty GuYanTools root worktree.

- [ ] **Step 4: Install and run the marketplace release**

Refresh the marketplace, approve the newly requested `secrets.self` permission, install/enable `0.2.5`, and start the normal Electron development app. Confirm QR generation, a visible logout action after authentication, authenticated quality options, and synchronized video/audio times.

## Plan Self-Review

- Spec coverage: Tasks 1-2 cover the generic credential boundary and preview proxy; Task 3 covers QR login, encrypted plugin secret, logout, and authenticated quality resolution; Task 4 covers all synchronization and quality replacement requirements; Task 5 covers build, publishing, and live validation.
- Placeholder scan: no deferred implementation steps or unspecified test cases remain.
- Type consistency: `PluginCredentialReference` is the shared type used by network and media preview APIs; its `secretKey` and `allowedOrigins` fields are consistent throughout all tasks.
