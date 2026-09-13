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
$local = (Get-Content -LiteralPath (Join-Path $PSScriptRoot '../backend/firestore.rules') -Raw).Replace("`r`n", "`n")
$changed = 0
foreach ($file in $ruleset.source.files) {
  $content = $file.content.Replace("`r`n", "`n")
  foreach ($name in @('isHostThreadParticipant', 'isBusinessThreadParticipant')) {
    $pattern = '    function ' + $name + '\(data\) \{[\s\S]*?\n    \}'
    $before = [regex]::Matches($content, $pattern)
    $after = [regex]::Matches($local, $pattern)
    if ($before.Count -ne 1 -or $after.Count -ne 1) { throw "Unexpected participant rule: $name" }
    if ($before[0].Value -ne $after[0].Value) { $content = $content.Replace($before[0].Value, $after[0].Value); $changed++ }
  }
  $oldUpdate = '      allow update: if isHostThreadParticipant(resource.data);'
  $newUpdate = [regex]::Match($local, '      allow update: if isHostThreadParticipant\(resource.data\)[\s\S]*?;').Value
  if (!$newUpdate) { throw 'Missing local host identity rule.' }
  if ($content.Contains($oldUpdate)) { $content = $content.Replace($oldUpdate, $newUpdate); $changed++ }
  elseif (!$content.Contains($newUpdate)) { throw 'Unexpected live host update rule.' }
  foreach ($name in @('supportSubmissions', 'supportEmailOutbox', 'supportSubmissionLimits')) {
    if (!$content.Contains("match /$name/")) {
      $block = [regex]::Match($local, '    match /' + $name + '/\{document=\*\*\} \{[\s\S]*?\n    \}').Value
      if (!$block) { throw "Missing private rule: $name" }
      $anchor = '    // Recipient-specific workflow notifications'
      if (!$content.Contains($anchor)) { throw 'Live insertion anchor missing; no deployment.' }
      $content = $content.Replace($anchor, $block + "`n`n" + $anchor); $changed++
    }
  }
  $file.content = $content
}
Write-Output "Current ruleset: $($release.rulesetName); scoped changes: $changed"
if (!$Apply -or $changed -eq 0) { return }
$body = @{ source = $ruleset.source } | ConvertTo-Json -Depth 30
$created = Invoke-RestMethod -Method Post -Headers $headers -ContentType 'application/json' -Uri "$base/projects/$project/rulesets" -Body $body
$latest = Invoke-RestMethod -Headers $headers -Uri $releaseUri
if ($latest.rulesetName -ne $release.rulesetName) { throw 'Live rules changed; release not updated.' }
$update = @{ release = @{ name = $release.name; rulesetName = $created.name }; updateMask = 'ruleset_name' } | ConvertTo-Json -Depth 5
$result = Invoke-RestMethod -Method Patch -Headers $headers -ContentType 'application/json' -Uri $releaseUri -Body $update
Write-Output "Published ruleset: $($result.rulesetName)"
Write-Output "Rollback ruleset retained: $($release.rulesetName)"
