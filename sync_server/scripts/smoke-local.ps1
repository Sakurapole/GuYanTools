$ErrorActionPreference = 'Stop'

$BaseUrl = if ($env:GUYANTOOLS_SYNC_BASE_URL) {
  $env:GUYANTOOLS_SYNC_BASE_URL
} else {
  'http://127.0.0.1:38420'
}

$email = "sync-smoke-$([guid]::NewGuid().ToString('N'))@example.local"
$password = 'smoke-password'

$register = Invoke-RestMethod `
  -Uri "$BaseUrl/v1/auth/register" `
  -Method Post `
  -ContentType 'application/json' `
  -Body (@{ email = $email; password = $password } | ConvertTo-Json)

$login = Invoke-RestMethod `
  -Uri "$BaseUrl/v1/auth/login" `
  -Method Post `
  -ContentType 'application/json' `
  -Body (@{ email = $email; password = $password } | ConvertTo-Json)

if (-not $login.accessToken) {
  throw 'login did not return accessToken'
}

$authHeaders = @{ Authorization = "Bearer $($login.accessToken)" }
$device = Invoke-RestMethod `
  -Uri "$BaseUrl/v1/devices/register" `
  -Method Post `
  -Headers $authHeaders `
  -ContentType 'application/json' `
  -Body (@{ deviceName = 'Smoke Device'; platform = 'windows' } | ConvertTo-Json)

$headers = @{
  Authorization = "Bearer $($login.accessToken)"
  'X-GuYanTools-Device-Token' = $device.deviceToken
}

$bootstrap = Invoke-RestMethod `
  -Uri "$BaseUrl/v1/sync/bootstrap" `
  -Method Post `
  -Headers $headers `
  -ContentType 'application/json' `
  -Body (@{ deviceId = $device.deviceId } | ConvertTo-Json)

$wrongDeviceId = [guid]::NewGuid().ToString()
$wrongDeviceBootstrapFailed = $false
try {
  Invoke-RestMethod `
    -Uri "$BaseUrl/v1/sync/bootstrap" `
    -Method Post `
    -Headers $headers `
    -ContentType 'application/json' `
    -Body (@{ deviceId = $wrongDeviceId } | ConvertTo-Json) | Out-Null
} catch {
  $wrongDeviceBootstrapFailed = $true
  if ($_.Exception.Response.StatusCode -ne 403) {
    throw "bootstrap with mismatched deviceId returned unexpected status: $($_.Exception.Response.StatusCode)"
  }
}
if (-not $wrongDeviceBootstrapFailed) {
  throw 'Expected bootstrap with mismatched deviceId to fail'
}

$opId = "op-$([guid]::NewGuid().ToString('N'))"
$pushBody = @{
  deviceId = $device.deviceId
  opId = $opId
  objects = @(@{
    collection = 'app.profile'
    objectId = 'profile-smoke'
    payload = @{ profileName = 'Smoke'; updatedAt = 1 }
    deleted = $false
  })
} | ConvertTo-Json -Depth 8

$push1 = Invoke-RestMethod `
  -Uri "$BaseUrl/v1/sync/push" `
  -Method Post `
  -Headers $headers `
  -ContentType 'application/json' `
  -Body $pushBody
$push2 = Invoke-RestMethod `
  -Uri "$BaseUrl/v1/sync/push" `
  -Method Post `
  -Headers $headers `
  -ContentType 'application/json' `
  -Body $pushBody

if ($push1.seq -ne $push2.seq -or $push1.serverRev -ne $push2.serverRev) {
  throw "idempotent push mismatch: $($push1 | ConvertTo-Json -Compress) vs $($push2 | ConvertTo-Json -Compress)"
}

$pull = Invoke-RestMethod `
  -Uri "$BaseUrl/v1/sync/pull?since=0&limit=20&collections=app.profile" `
  -Method Get `
  -Headers $headers

if (-not ($pull.objects | Where-Object { $_.objectId -eq 'profile-smoke' })) {
  throw 'pull did not return pushed object'
}

$ack = Invoke-RestMethod `
  -Uri "$BaseUrl/v1/sync/ack" `
  -Method Post `
  -Headers $headers `
  -ContentType 'application/json' `
  -Body (@{ deviceId = $device.deviceId; cursor = $pull.cursor } | ConvertTo-Json)

$pullAfterAck = Invoke-RestMethod `
  -Uri "$BaseUrl/v1/sync/pull?since=$($ack.cursor)&limit=20&collections=app.profile" `
  -Method Get `
  -Headers $headers

if ($pullAfterAck.objects.Count -ne 0) {
  throw "pull after ack returned already acknowledged objects: $($pullAfterAck | ConvertTo-Json -Compress)"
}

$batchFirstId = "profile-batch-a-$([guid]::NewGuid().ToString('N'))"
$batchSecondId = "profile-batch-b-$([guid]::NewGuid().ToString('N'))"
$batchPush = Invoke-RestMethod `
  -Uri "$BaseUrl/v1/sync/push" `
  -Method Post `
  -Headers $headers `
  -ContentType 'application/json' `
  -Body (@{
    deviceId = $device.deviceId
    opId = "op-$([guid]::NewGuid().ToString('N'))"
    objects = @(
      @{
        collection = 'app.profile'
        objectId = $batchFirstId
        payload = @{ profileName = 'Batch A'; updatedAt = 1 }
        deleted = $false
      },
      @{
        collection = 'app.profile'
        objectId = $batchSecondId
        payload = @{ profileName = 'Batch B'; updatedAt = 1 }
        deleted = $false
      }
    )
  } | ConvertTo-Json -Depth 8)

if (-not $batchPush.applied -or $batchPush.applied.Count -ne 2) {
  throw "batch push did not return per-object revisions: $($batchPush | ConvertTo-Json -Compress -Depth 8)"
}

$batchFirstRev = ($batchPush.applied | Where-Object { $_.objectId -eq $batchFirstId } | Select-Object -First 1).serverRev
$batchSecondRev = ($batchPush.applied | Where-Object { $_.objectId -eq $batchSecondId } | Select-Object -First 1).serverRev
if (-not $batchFirstRev -or -not $batchSecondRev -or $batchFirstRev -eq $batchSecondRev) {
  throw "batch push returned invalid object revisions: $($batchPush | ConvertTo-Json -Compress -Depth 8)"
}

$batchUpdate = Invoke-RestMethod `
  -Uri "$BaseUrl/v1/sync/push" `
  -Method Post `
  -Headers $headers `
  -ContentType 'application/json' `
  -Body (@{
    deviceId = $device.deviceId
    opId = "op-$([guid]::NewGuid().ToString('N'))"
    objects = @(
      @{
        collection = 'app.profile'
        objectId = $batchFirstId
        baseRev = $batchFirstRev
        payload = @{ profileName = 'Batch A Updated'; updatedAt = 2 }
        deleted = $false
      },
      @{
        collection = 'app.profile'
        objectId = $batchSecondId
        baseRev = $batchSecondRev
        payload = @{ profileName = 'Batch B Updated'; updatedAt = 2 }
        deleted = $false
      }
    )
  } | ConvertTo-Json -Depth 8)

if ($batchUpdate.accepted -ne 2 -or ($batchUpdate.conflicts -and $batchUpdate.conflicts.Count -ne 0)) {
  throw "batch update with per-object baseRev should succeed: $($batchUpdate | ConvertTo-Json -Compress -Depth 8)"
}

$duplicateObjectRejected = $false
try {
  Invoke-RestMethod `
    -Uri "$BaseUrl/v1/sync/push" `
    -Method Post `
    -Headers $headers `
    -ContentType 'application/json' `
    -Body (@{
      deviceId = $device.deviceId
      opId = "op-$([guid]::NewGuid().ToString('N'))"
      objects = @(
        @{
          collection = 'app.profile'
          objectId = $batchFirstId
          baseRev = $batchUpdate.applied[0].serverRev
          payload = @{ profileName = 'Duplicate A'; updatedAt = 3 }
          deleted = $false
        },
        @{
          collection = 'app.profile'
          objectId = $batchFirstId
          baseRev = $batchUpdate.applied[0].serverRev
          payload = @{ profileName = 'Duplicate B'; updatedAt = 4 }
          deleted = $false
        }
      )
    } | ConvertTo-Json -Depth 8) | Out-Null
} catch {
  $duplicateObjectRejected = $true
  if ($_.Exception.Response.StatusCode -ne 400) {
    throw "duplicate object push returned unexpected status: $($_.Exception.Response.StatusCode)"
  }
}
if (-not $duplicateObjectRejected) {
  throw 'Expected duplicate object push to fail'
}

$unknownCollectionRejected = $false
try {
  Invoke-RestMethod `
    -Uri "$BaseUrl/v1/sync/push" `
    -Method Post `
    -Headers $headers `
    -ContentType 'application/json' `
    -Body (@{
      deviceId = $device.deviceId
      opId = "op-$([guid]::NewGuid().ToString('N'))"
      objects = @(@{
        collection = 'unknown.collection'
        objectId = 'bad-object'
        payload = @{ value = 1 }
        deleted = $false
      })
    } | ConvertTo-Json -Depth 8) | Out-Null
} catch {
  $unknownCollectionRejected = $true
  if ($_.Exception.Response.StatusCode -ne 400) {
    throw "unknown collection push returned unexpected status: $($_.Exception.Response.StatusCode)"
  }
}
if (-not $unknownCollectionRejected) {
  throw 'Expected unknown collection push to fail'
}

$conflictObjectId = "profile-conflict-$([guid]::NewGuid().ToString('N'))"
$conflictCreateBody = @{
  deviceId = $device.deviceId
  opId = "op-$([guid]::NewGuid().ToString('N'))"
  objects = @(@{
    collection = 'app.profile'
    objectId = $conflictObjectId
    payload = @{ profileName = 'Server Winner'; updatedAt = 2 }
    deleted = $false
  })
} | ConvertTo-Json -Depth 8

$conflictCreate = Invoke-RestMethod `
  -Uri "$BaseUrl/v1/sync/push" `
  -Method Post `
  -Headers $headers `
  -ContentType 'application/json' `
  -Body $conflictCreateBody

$stalePushOpId = "op-$([guid]::NewGuid().ToString('N'))"
$stalePushBody = @{
  deviceId = $device.deviceId
  opId = $stalePushOpId
  objects = @(@{
    collection = 'app.profile'
    objectId = $conflictObjectId
    baseRev = 'stale-rev'
    payload = @{ profileName = 'Stale Loser'; updatedAt = 3 }
    deleted = $false
  })
} | ConvertTo-Json -Depth 8

$stalePush = Invoke-RestMethod `
  -Uri "$BaseUrl/v1/sync/push" `
  -Method Post `
  -Headers $headers `
  -ContentType 'application/json' `
  -Body $stalePushBody

if ($stalePush.accepted -ne 0 -or -not $stalePush.conflicts -or $stalePush.conflicts.Count -ne 1) {
  throw "stale push was not rejected as a conflict: $($stalePush | ConvertTo-Json -Compress -Depth 8)"
}
if ($stalePush.seq -ne $conflictCreate.seq -or $stalePush.serverRev -ne $conflictCreate.serverRev) {
  throw "all-conflict push did not return current server cursor/revision: $($stalePush | ConvertTo-Json -Compress -Depth 8)"
}
if ($stalePush.conflicts[0].serverRev -ne $conflictCreate.serverRev) {
  throw "conflict did not report current server revision: $($stalePush | ConvertTo-Json -Compress -Depth 8)"
}
$stalePushRetry = Invoke-RestMethod `
  -Uri "$BaseUrl/v1/sync/push" `
  -Method Post `
  -Headers $headers `
  -ContentType 'application/json' `
  -Body $stalePushBody
if ($stalePushRetry.accepted -ne $stalePush.accepted -or -not $stalePushRetry.conflicts -or $stalePushRetry.conflicts.Count -ne 1 -or $stalePushRetry.conflicts[0].conflictId -ne $stalePush.conflicts[0].conflictId) {
  throw "stale push retry was not idempotent: $($stalePushRetry | ConvertTo-Json -Compress -Depth 8)"
}

$serverConflicts = Invoke-RestMethod `
  -Uri "$BaseUrl/v1/sync/conflicts" `
  -Method Get `
  -Headers $headers
$serverConflict = $serverConflicts.conflicts | Where-Object { $_.objectId -eq $conflictObjectId } | Select-Object -First 1
if (-not $serverConflict -or $serverConflict.status -ne 'pending') {
  throw "server did not persist stale push conflict: $($serverConflicts | ConvertTo-Json -Compress -Depth 8)"
}

$resolvedConflict = Invoke-RestMethod `
  -Uri "$BaseUrl/v1/sync/conflicts/$($serverConflict.id)/resolve" `
  -Method Post `
  -Headers $headers `
  -ContentType 'application/json' `
  -Body (@{ resolution = 'use-server' } | ConvertTo-Json)
if ($resolvedConflict.status -ne 'resolved') {
  throw "server conflict resolve did not return resolved: $($resolvedConflict | ConvertTo-Json -Compress -Depth 8)"
}
$resolvedServerConflicts = Invoke-RestMethod `
  -Uri "$BaseUrl/v1/sync/conflicts" `
  -Method Get `
  -Headers $headers
$resolvedServerConflict = $resolvedServerConflicts.conflicts | Where-Object { $_.id -eq $serverConflict.id } | Select-Object -First 1
if (-not $resolvedServerConflict -or $resolvedServerConflict.status -ne 'resolved') {
  throw "server conflict persisted status is not resolved: $($resolvedServerConflicts | ConvertTo-Json -Compress -Depth 8)"
}

$conflictPull = Invoke-RestMethod `
  -Uri "$BaseUrl/v1/sync/pull?since=$($conflictCreate.seq - 1)&limit=20&collections=app.profile" `
  -Method Get `
  -Headers $headers
$currentConflictObject = $conflictPull.objects | Where-Object { $_.objectId -eq $conflictObjectId } | Select-Object -First 1
if (-not $currentConflictObject -or $currentConflictObject.payload.profileName -ne 'Server Winner') {
  throw "stale push overwrote current server object: $($conflictPull | ConvertTo-Json -Compress -Depth 8)"
}

$assetBytes = [System.Text.Encoding]::UTF8.GetBytes('asset-smoke-content')
Invoke-RestMethod `
  -Uri "$BaseUrl/v1/assets/smoke/asset.txt" `
  -Method Put `
  -Headers $headers `
  -ContentType 'text/plain' `
  -Body $assetBytes | Out-Null

$assetFile = Join-Path ([System.IO.Path]::GetTempPath()) "guyantools-sync-asset-$([guid]::NewGuid().ToString('N')).txt"
Invoke-WebRequest `
  -Uri "$BaseUrl/v1/assets/smoke/asset.txt" `
  -Method Get `
  -Headers $headers `
  -OutFile $assetFile | Out-Null

$downloaded = [System.IO.File]::ReadAllText($assetFile)
if ($downloaded -ne 'asset-smoke-content') {
  throw "asset content mismatch: $downloaded"
}

$revoke = Invoke-RestMethod `
  -Uri "$BaseUrl/v1/devices/$($device.deviceId)/revoke" `
  -Method Post `
  -Headers $authHeaders

if (-not $revoke.revoked) {
  throw 'device revoke did not return revoked=true'
}

$revokedBootstrapFailed = $false
try {
  Invoke-RestMethod `
    -Uri "$BaseUrl/v1/sync/bootstrap" `
    -Method Post `
    -Headers $headers `
    -ContentType 'application/json' `
    -Body (@{ deviceId = $device.deviceId } | ConvertTo-Json) | Out-Null
} catch {
  $revokedBootstrapFailed = $true
  if ($_.Exception.Response.StatusCode -ne 401) {
    throw "bootstrap with revoked device returned unexpected status: $($_.Exception.Response.StatusCode)"
  }
}
if (-not $revokedBootstrapFailed) {
  throw 'Expected bootstrap with revoked device to fail'
}

[pscustomobject]@{
  userId = $login.userId
  deviceId = $device.deviceId
  bootstrapCursor = $bootstrap.cursor
  pushSeq = $push1.seq
  idempotentSeq = $push2.seq
  pulled = $pull.objects.Count
  ackCursor = $ack.cursor
  pulledAfterAck = $pullAfterAck.objects.Count
  conflictCount = $stalePush.conflicts.Count
  resolvedConflictStatus = $resolvedConflict.status
  assetDownloaded = $downloaded
  deviceRevoked = $revoke.revoked
} | ConvertTo-Json -Compress
