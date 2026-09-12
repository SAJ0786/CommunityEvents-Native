param([switch]$Apply)
$ErrorActionPreference = 'Stop'
$project = 'community-event-8b639'
$token = gcloud.cmd auth print-access-token
if ($LASTEXITCODE -ne 0) { throw 'Google authentication failed.' }
$headers = @{ Authorization = "Bearer $token"; 'x-goog-user-project' = $project }
$base = 'https://firebaserules.googleapis.com/v1'
$releaseUri = "$base/projects/$project/releases/cloud.firestore"
$release = Invoke-RestMethod -Headers $headers -Uri $releaseUri
$ruleset = Invoke-RestMethod -Headers $headers -Uri "$base/$($release.rulesetName)"
$before = 'allow create: if isHostThreadParticipant(' + "`n" + '          get(/databases/$(database)/documents/hostMessageThreads/$(threadId)).data'
$after = $before.Replace('get(', 'getAfter(')
$count = 0
foreach ($file in $ruleset.source.files) {
  $content = $file.content.Replace("`r`n", "`n")
  if ($content.Contains($before)) {
    $count += ($content.Split(@($before), [StringSplitOptions]::None).Length - 1)
    $file.content = $content.Replace($before, $after)
  }
}
if ($count -ne 1) { throw "Expected exactly one old host-message create rule; found $count. No deployment performed." }
Write-Output "Current ruleset: $($release.rulesetName)"
Write-Output 'Only change: host message creation reads the parent with getAfter instead of get, supporting atomic first messages.'
if (!$Apply) { return }
$body = @{ source = $ruleset.source } | ConvertTo-Json -Depth 30
$created = Invoke-RestMethod -Method Post -Headers $headers -ContentType 'application/json' -Uri "$base/projects/$project/rulesets" -Body $body
$latest = Invoke-RestMethod -Headers $headers -Uri $releaseUri
if ($latest.rulesetName -ne $release.rulesetName) { throw 'Live rules changed during validation. Release was not updated.' }
$update = @{ release = @{ name = $release.name; rulesetName = $created.name }; updateMask = 'ruleset_name' } | ConvertTo-Json -Depth 5
$result = Invoke-RestMethod -Method Patch -Headers $headers -ContentType 'application/json' -Uri $releaseUri -Body $update
Write-Output "Published ruleset: $($result.rulesetName)"
Write-Output "Rollback ruleset retained: $($release.rulesetName)"
