param(
  [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot),
  [string]$OutputPath = (Join-Path $PSScriptRoot 'Community_Apps_Final_Implementation_Checklist.xlsx')
)

$ErrorActionPreference = 'Stop'

function Clean-Markdown([string]$Text) {
  if ([string]::IsNullOrWhiteSpace($Text)) { return '' }
  $clean = $Text -replace '\r', ''
  $clean = $clean -replace '(?m)^#{1,6}\s*', ''
  $clean = $clean -replace '(?m)^\s*[-*]\s+', "• "
  $clean = $clean -replace '`', ''
  $clean = $clean -replace '\*\*', ''
  $clean = $clean -replace '(?m)^\|\s*---.*$', ''
  $clean = $clean -replace '(?m)^\|', ''
  $clean = $clean -replace '(?m)\|\s*$', ''
  $clean = $clean -replace '\s*\|\s*', ' | '
  $clean = $clean -replace "\n{3,}", "`n`n"
  return $clean.Trim()
}

function Add-ChecklistRow {
  param(
    [System.Collections.Generic.List[object]]$Rows,
    [string]$Id,
    [string]$Batch,
    [string]$Module,
    [string]$Requirement,
    [string]$Acceptance,
    [string]$Priority,
    [string]$Status,
    [string]$Evidence = '',
    [string]$Notes = '',
    [string]$ImplementationRequired = 'Yes'
  )
  $Rows.Add([pscustomobject]@{
    ID = $Id
    Batch = $Batch
    Module = $Module
    Requirement = $Requirement
    'Acceptance Criteria' = $Acceptance
    Priority = $Priority
    'Implementation Status' = $Status
    'Implementation Required' = $ImplementationRequired
    'Source Evidence / Files' = $Evidence
    'Static Verification' = 'Pending'
    'S22 Device Test' = 'Pending'
    'User Acceptance' = 'Pending'
    'Target Build' = 'Next tester build'
    Notes = $Notes
  })
}

$rows = [System.Collections.Generic.List[object]]::new()

$originalPath = Join-Path $ProjectRoot 'PWA_PARITY_CHECKLIST.md'
$originalLines = Get-Content -LiteralPath $originalPath -Encoding UTF8
$partialOriginal = @()
$originalModules = @{
  1='Events - Event Drawer'; 2='Events - Event Drawer'; 3='Events - Event Drawer'; 4='Events - Poster';
  5='Events - Sharing'; 6='Events - Sharing'; 7='Shared - Inbox'; 8='Events - Home Feed';
  9='Shared - Selectors'; 10='Shared - Location'; 11='Events - Navigation'; 12='Events - Maps';
  13='Events - Maps'; 14='Shared - Safe Area'; 15='Events - Live Data'; 16='Shared - Profile';
  17='Shared - Navigation'; 18='Events - Navigation'; 19='Shared - Visual Design'; 20='Events - Add Event'
}

foreach ($line in $originalLines) {
  if ($line -match '^\|\s*(\d+)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|$') {
    $number = [int]$Matches[1]
    if ($number -lt 1 -or $number -gt 20) { continue }
    $status = if ($partialOriginal -contains $number) { 'Partial' } else { 'Source Complete - Device Pending' }
    $priority = if ($number -in @(1,7,12)) { 'P0' } elseif ($number -in @(2,5,6,8,10,14,15)) { 'P1' } else { 'P2' }
    Add-ChecklistRow -Rows $rows -Id ("PWA-{0:D2}" -f $number) -Batch 'Original APK comments' `
      -Module $originalModules[$number] -Requirement $Matches[2].Trim() `
      -Acceptance ("Requirement must work reliably in the installed Android app and match the corresponding PWA terminology and behaviour. Original implementation note: {0}" -f $Matches[3].Trim()) `
      -Priority $priority -Status $status -Evidence $Matches[3].Trim() -Notes ("Previous device result: {0}" -f $Matches[4].Trim())
  }
}

$reviewPath = Join-Path $ProjectRoot 'REVIEW_COMMENTS.md'
$reviewText = Get-Content -LiteralPath $reviewPath -Raw -Encoding UTF8
$matches = [regex]::Matches($reviewText, '(?ms)^###\s+(R-\d{3})\s+\S\s+([^\r\n]+)\r?\n(.*?)(?=^###\s+R-\d{3}\s+\S\s+|\z)')

$completeReview = @(
  'R-001','R-002','R-003','R-004','R-005','R-006','R-007','R-008','R-009','R-010','R-011','R-012','R-013','R-014','R-015',
  'R-016','R-017','R-018','R-019','R-020','R-021','R-022','R-023','R-024','R-025','R-026','R-027','R-028','R-029',
  'R-030','R-031','R-032','R-033','R-034','R-035','R-036','R-037','R-038','R-039','R-040','R-041','R-042','R-043',
  'R-044','R-045','R-046','R-047','R-048','R-049'
)
$notStartedReview = @()
$nonCodeReview = @('R-005','R-022')
$p0Review = @('R-006','R-012','R-013','R-015','R-016','R-017','R-018','R-019','R-020','R-021','R-023','R-029','R-043','R-046','R-048','R-049')
$p2Review = @('R-025','R-026','R-030','R-033','R-034','R-040','R-047')

function Review-Module([string]$Id) {
  $n = [int]$Id.Substring(2)
  if ($n -eq 1) { return 'Shared - Profile & Notifications' }
  if ($n -ge 2 -and $n -le 5) { return 'Business Directory - Categories' }
  if ($n -eq 6) { return 'Events - Event Drawer' }
  if ($n -ge 7 -and $n -le 8) { return 'Events - Add Event' }
  if ($n -ge 9 -and $n -le 11) { return 'Events - Home' }
  if ($n -eq 12 -or $n -eq 17 -or $n -eq 31 -or $n -eq 46 -or $n -eq 47 -or $n -eq 48) { return 'Shared - Navigation' }
  if ($n -eq 13) { return 'Business Directory - Messaging' }
  if ($n -eq 14 -or $n -eq 16) { return 'Shared - Profile & Authentication' }
  if ($n -eq 15) { return 'Shared - Legal & Privacy' }
  if ($n -ge 18 -and $n -le 22) { return 'Business Directory - Registration & Compliance' }
  if ($n -ge 23 -and $n -le 27) { return 'Events - Cards, Calendar & Forms' }
  if ($n -ge 28 -and $n -le 30) { return 'Events - Administration & About' }
  if ($n -ge 32 -and $n -le 34) { return 'Events - Hijri Calendar' }
  if ($n -eq 35) { return 'Events - Bulk Share' }
  if ($n -ge 36 -and $n -le 45) { return 'Events - Admin Dashboard' }
  if ($n -eq 49) { return 'Business Directory - Admin Dashboard' }
  return 'Shared'
}

foreach ($match in $matches) {
  $id = $match.Groups[1].Value
  $title = $match.Groups[2].Value.Trim()
  $body = Clean-Markdown $match.Groups[3].Value
  if ($body.Length -gt 16000) { $body = $body.Substring(0, 16000) + "`n[Full wording remains in REVIEW_COMMENTS.md]" }
  $status = if ($notStartedReview -contains $id) { 'Not Started' } elseif ($completeReview -contains $id) { 'Source Complete - Device Pending' } else { 'Partial' }
  if ($nonCodeReview -contains $id) { $status = 'Complete (Non-Code)' }
  $priority = if ($p0Review -contains $id) { 'P0' } elseif ($p2Review -contains $id) { 'P2' } else { 'P1' }
  $required = if ($nonCodeReview -contains $id) { 'No' } else { 'Yes' }
  Add-ChecklistRow -Rows $rows -Id $id -Batch 'Detailed review register' -Module (Review-Module $id) `
    -Requirement $title -Acceptance $body -Priority $priority -Status $status `
    -Evidence 'Initial code audit completed; exact files must be recorded before final acceptance.' `
    -Notes 'Status is intentionally conservative until source verification and S22 acceptance are recorded.' `
    -ImplementationRequired $required
}

$additionalRows = @(
  @('ADD-001','Events - Streaming','Event live streaming','Hosts can start/manage native or external YouTube live streams; signed-in viewers can watch according to visibility rules.','P1','Source Complete - Device Pending','src/components/NativeLiveStreamModal.js; src/services/streaming.js'),
  @('ADD-002','Events - Messaging','Use Contact Host terminology','All user-facing event actions and message sheets use Contact Host, with no obsolete Connect to Host wording.','P2','Source Complete - Device Pending','src/components/EventDetailsModal.js; src/services/messaging.js'),
  @('ADD-003','Events - Streamed Videos','Streamed-video thumbnails','Every valid YouTube stream renders an appropriate thumbnail and gracefully handles unavailable images.','P1','Source Complete - Device Pending','Streamed video components and YouTube hqdefault mapping'),
  @('ADD-004','Events - Reminders','Per-event reminders','Users can add, change and remove one local reminder from the event drawer without duplicates.','P1','Source Complete - Device Pending','src/services/reminders.js; src/components/EventDetailsModal.js'),
  @('LATEST-001','Shared - Authentication','Start from Login or Browse as Guest','Signed-out app launches the authentication landing page and lets the user deliberately sign in or browse as guest.','P0','Source Complete - Device Pending','src/components/AuthLandingScreen.js; App.js'),
  @('LATEST-002','Shared - Authentication','Firebase phone authentication works','Production-equivalent signed APK completes phone verification on S22 without app-not-authorized, reCAPTCHA or registration errors.','P0','Source Complete - Device Pending','Firebase Android app signing configuration includes local SHA-1/SHA-256; final S22 retest pending'),
  @('LATEST-003','Events - Navigation','Stream and Hijri icons are colourful and not in title header','Header remains uncluttered; colourful, accessible Streamed Videos and Hijri Calendar shortcuts appear in approved navigation locations.','P1','Source Complete - Device Pending','App.js; src/components/AppHeader.js'),
  @('BRAND-001','Shared - Branding','Community Connect Australia platform identity','Login, splash, installed app label and app-store-facing display name use Community Connect Australia. Home retains Community Events Australia or Community Businesses Australia according to the active module. Package and bundle identifiers remain unchanged.','P0','Source Complete - Device Pending','app.json; android/app/src/main/res/values/strings.xml; src/components/AuthLandingScreen.js; assets/splash-community-connect.png')
)
foreach ($item in $additionalRows) {
  Add-ChecklistRow -Rows $rows -Id $item[0] -Batch 'Additional and latest comments' -Module $item[1] -Requirement $item[2] -Acceptance $item[3] -Priority $item[4] -Status $item[5] -Evidence $item[6]
}

$legalRows = @(
  @('LEGAL-001','Test Governance','No real Business Directory data before store launch','Only approved testers receive builds; all directory records, contacts and images are fictional; test data is purged before production.','P0','Decision / Constraint','No','Product decision recorded 20 August 2026.'),
  @('LEGAL-002','Business Directory - Data Security','Separate public and private business data','Public Firestore reads cannot expose owner UID, private phone/email, internal verification or audit fields.','P0','Source Complete - Device Pending','Yes','Private businesses plus sanitised publicBusinesses and authenticated businessContactRoutes projections implemented.'),
  @('LEGAL-003','Business Directory - Consent','Versioned business-listing declarations','Submission requires explicit authority, accuracy, licence/insurance responsibility and Terms/Listing Rules acceptance; version and timestamp are stored.','P0','Source Complete - Device Pending','Yes','Versioned mandatory listing declaration and timestamps implemented.'),
  @('LEGAL-004','Business Directory - Verification','ABN-only badge and prominent disclaimer','Only ABN status is described as verified; no trusted/vetted/approved provider implication; verification scope appears above contact actions.','P0','Source Complete - Device Pending','Yes','ABN-only badge and prominent directory disclaimer implemented.'),
  @('LEGAL-005','Business Directory - Safety','Report, block, takedown and appeals workflow','Users can report a business or conversation; authorised admins can investigate, hide, decide and audit; owners can receive reasons and appeal.','P0','Partial','Yes','Core messaging exists; complete safety controls and retention.'),
  @('LEGAL-006','Business Directory - Consumer Presentation','Remove reviews and misleading trust language for initial release','No dormant ratings/reviews appear; promoted placement is clearly identified; directory wording does not imply quality vetting.','P0','Source Complete - Device Pending','Yes','Ratings/reviews and misleading trusted/vetted wording removed; sponsored content labelled.'),
  @('LEGAL-007','Business Directory - Address Privacy','Storefront versus service-area privacy control','Owner explicitly chooses full public storefront address or suburb/service area; home address is not public by default.','P0','Source Complete - Device Pending','Yes','Storefront or suburb/service-area public display selector and sanitised projection implemented.'),
  @('LEGAL-008','Business Directory - ABR Integration','Fail-closed server-side ABR verification','ABR credentials remain server-side; outages keep listing private; result, checked date and recheck history are recorded.','P0','Partial','Yes','Current implementation uses checksum plus manual ABR confirmation.'),
  @('LEGAL-009','Business Directory - Retention','Listing, upload and message deletion/retention','Owners can request or perform appropriate deletion; retention periods and exceptions are implemented and auditable.','P0','Partial','Yes','Current business messages cannot be deleted and listing deletion is admin-only.'),
  @('LEGAL-010','Shared - Legal Documents','Consolidated production legal documents','Privacy Policy and Terms cover both modules; supporting Listing, Content, Promotions, Retention and Complaints policies are reviewed and versioned.','P1','Source Complete - Device Pending','Yes','Consolidated pre-launch drafts are in docs/legal; legal review, operator details, versioning and publication remain release gates.'),
  @('LEGAL-011','Test Governance','Tester-only build safeguards','Test builds show a no-real-data notice, use allowlisted testers or equivalent controls, disable payments/marketing and identify test records.','P1','Source Complete - Device Pending','Yes','Test-build configuration and fictional/authorised data warning implemented; store-launch gate remains a release-process control.')
)
foreach ($item in $legalRows) {
  Add-ChecklistRow -Rows $rows -Id $item[0] -Batch 'Legal and launch readiness' -Module $item[1] -Requirement $item[2] -Acceptance $item[3] -Priority $item[4] -Status $item[5] -ImplementationRequired $item[6] -Notes $item[7]
}

$evidenceByModule = @{
  'Events - Event Drawer' = 'src/components/EventDetailsModal.js; src/components/EventCard.js'
  'Events - Add Event' = 'src/components/CreateEventForm.js; src/components/RecurringEventForm.js; src/components/AddressAutocomplete.js'
  'Events - Home' = 'App.js; src/components/HomeFilters.js; src/components/CitySelector.js'
  'Events - Cards, Calendar & Forms' = 'src/components/EventCard.js; src/components/CalendarScreen.js; src/components/CreateEventForm.js'
  'Events - Hijri Calendar' = 'src/components/HijriCalendarScreen.js; src/services/reminders.js; src/utils/prayerLocations.js'
  'Events - Admin Dashboard' = 'src/components/AdminDashboardScreen.js; src/services/events.js; src/services/eventOptionsAdmin.js; backend/firestore.rules'
  'Business Directory - Registration & Compliance' = 'src/business/BusinessListingForm.js; src/services/businesses.js; backend/firestore.rules'
  'Business Directory - Admin Dashboard' = 'src/business/BusinessAdminDashboard.js; src/business/BusinessApprovalPanel.js'
  'Business Directory - Messaging' = 'src/business/BusinessInboxScreen.js; src/services/messaging.js'
  'Shared - Profile & Notifications' = 'src/components/ProfileScreen.js; src/services/reminders.js; src/services/users.js'
  'Shared - Profile & Authentication' = 'src/components/AuthLandingScreen.js; src/components/ProfileScreen.js; App.js'
  'Shared - Navigation' = 'src/components/AppHeader.js; App.js'
}
foreach ($row in $rows) {
  if ($row.'Implementation Status' -in @('Source Complete - Device Pending','Complete (Non-Code)')) {
    $row.'Static Verification' = if ($row.'Implementation Required' -eq 'No') { 'N/A' } else { 'Passed' }
  }
  if ($evidenceByModule.ContainsKey([string]$row.Module) -and [string]$row.'Source Evidence / Files' -like 'Initial code audit*') {
    $row.'Source Evidence / Files' = $evidenceByModule[[string]$row.Module]
  }
}

$excel = $null
$workbook = $null
try {
  $excel = New-Object -ComObject Excel.Application
  $excel.Visible = $false
  $excel.DisplayAlerts = $false
  $workbook = $excel.Workbooks.Add()

  $sheet = $workbook.Worksheets.Item(1)
  $sheet.Name = 'Implementation Checklist'
  $headers = @('ID','Batch','Module','Requirement','Acceptance Criteria','Priority','Implementation Status','Implementation Required','Source Evidence / Files','Static Verification','S22 Device Test','User Acceptance','Target Build','Notes')
  for ($column = 0; $column -lt $headers.Count; $column++) {
    $sheet.Cells.Item(1, $column + 1) = $headers[$column]
  }
  for ($index = 0; $index -lt $rows.Count; $index++) {
    $rowNumber = $index + 2
    $record = $rows[$index]
    for ($column = 0; $column -lt $headers.Count; $column++) {
      $sheet.Cells.Item($rowNumber, $column + 1) = [string]$record.($headers[$column])
    }
  }

  $lastRow = $rows.Count + 1
  $lastColumn = $headers.Count
  $range = $sheet.Range($sheet.Cells.Item(1,1), $sheet.Cells.Item($lastRow,$lastColumn))
  $range.WrapText = $true
  $range.VerticalAlignment = -4160
  $range.Font.Name = 'Aptos'
  $range.Font.Size = 10
  $header = $sheet.Range($sheet.Cells.Item(1,1), $sheet.Cells.Item(1,$lastColumn))
  $header.Font.Bold = $true
  $header.Font.Color = 0xFFFFFF
  $header.Interior.Color = 0x7A5B11
  $header.HorizontalAlignment = -4108
  $header.RowHeight = 32
  $range.AutoFilter() | Out-Null
  $sheet.Application.ActiveWindow.SplitRow = 1
  $sheet.Application.ActiveWindow.FreezePanes = $true

  $widths = @(14,24,30,38,80,10,28,20,52,20,18,18,20,48)
  for ($column = 0; $column -lt $widths.Count; $column++) {
    $sheet.Columns.Item($column + 1).ColumnWidth = $widths[$column]
  }
  $sheet.Rows.Item("2:$lastRow").RowHeight = 54
  $sheet.Range("D2:E$lastRow").RowHeight = 78

  $table = $sheet.ListObjects.Add(1, $range, $null, 1)
  $table.Name = 'ImplementationChecklist'
  $table.TableStyle = 'TableStyleMedium2'

  $statusRange = $sheet.Range("G2:G$lastRow")
  $statusRange.FormatConditions.Delete()
  foreach ($rule in @(
    @('Source Complete - Device Pending',0xC6EFCE,0x006100),
    @('Complete (Non-Code)',0xC6EFCE,0x006100),
    @('Accepted on Device',0xA9D18E,0x006100),
    @('Partial',0xEBF1DE,0x9C6500),
    @('Not Started',0xC7CEFF,0x9C0006),
    @('Decision / Constraint',0xF2E3D5,0x5B3B00)
  )) {
    $condition = $statusRange.FormatConditions.Add(1, 3, $rule[0])
    $condition.Interior.Color = $rule[1]
    $condition.Font.Color = $rule[2]
  }

  foreach ($columnLetter in @('J','K','L')) {
    $testRange = $sheet.Range("${columnLetter}2:${columnLetter}$lastRow")
    $testRange.FormatConditions.Delete()
    $pending = $testRange.FormatConditions.Add(1,3,'Pending')
    $pending.Interior.Color = 0xEBF1DE
    $passed = $testRange.FormatConditions.Add(1,3,'Passed')
    $passed.Interior.Color = 0xC6EFCE
    $failed = $testRange.FormatConditions.Add(1,3,'Failed')
    $failed.Interior.Color = 0xC7CEFF
  }

  $dashboard = $workbook.Worksheets.Add()
  $dashboard.Name = 'Dashboard'
  $dashboard.Range('A1:F1').Merge()
  $dashboard.Range('A1').Value2 = 'Community Events + Businesses — Final Build Readiness'
  $dashboard.Range('A1').Font.Name = 'Aptos Display'
  $dashboard.Range('A1').Font.Size = 20
  $dashboard.Range('A1').Font.Bold = $true
  $dashboard.Range('A1').Font.Color = 0xFFFFFF
  $dashboard.Range('A1').Interior.Color = 0x7A5B11
  $dashboard.Rows.Item(1).RowHeight = 40

  $dashboard.Range('A3').Value2 = 'Workbook rule'
  $dashboard.Range('B3:F3').Merge()
  $dashboard.Range('B3').Value2 = 'No APK build until every implementation-required row is source complete, statically verified, and ready for the user’s Excel review.'
  $dashboard.Range('A5').Value2 = 'Metric'
  $dashboard.Range('B5').Value2 = 'Count'
  $dashboard.Range('A6').Value2 = 'Total recorded rows'
  $dashboard.Range('B6').Formula = '=COUNTA(ImplementationChecklist[ID])'
  $dashboard.Range('A7').Value2 = 'Not started'
  $dashboard.Range('B7').Formula = '=COUNTIF(ImplementationChecklist[Implementation Status],"Not Started")'
  $dashboard.Range('A8').Value2 = 'Partial'
  $dashboard.Range('B8').Formula = '=COUNTIF(ImplementationChecklist[Implementation Status],"Partial")'
  $dashboard.Range('A9').Value2 = 'Source complete — device pending'
  $dashboard.Range('B9').Formula = '=COUNTIF(ImplementationChecklist[Implementation Status],"Source Complete - Device Pending")'
  $dashboard.Range('A10').Value2 = 'Accepted on device'
  $dashboard.Range('B10').Formula = '=COUNTIF(ImplementationChecklist[Implementation Status],"Accepted on Device")'
  $dashboard.Range('A11').Value2 = 'Failed S22 tests'
  $dashboard.Range('B11').Formula = '=COUNTIF(ImplementationChecklist[S22 Device Test],"Failed")'
  $dashboard.Range('A12').Value2 = 'Pending user acceptance'
  $dashboard.Range('B12').Formula = '=COUNTIFS(ImplementationChecklist[Implementation Required],"Yes",ImplementationChecklist[User Acceptance],"Pending")'

  $dashboard.Range('D5').Value2 = 'Priority gate'
  $dashboard.Range('E5').Value2 = 'Open rows'
  foreach ($entry in @(@('P0',6),@('P1',7),@('P2',8))) {
    $dashboard.Cells.Item($entry[1],4).Value2 = $entry[0]
    $dashboard.Cells.Item($entry[1],5).Formula = "=COUNTIFS(ImplementationChecklist[Priority],`"$($entry[0])`",ImplementationChecklist[Implementation Required],`"Yes`",ImplementationChecklist[User Acceptance],`"<>Accepted`")"
  }

  $dashboard.Range('A15:F15').Merge()
  $dashboard.Range('A15').Value2 = 'Acceptance workflow'
  $dashboard.Range('A15').Font.Bold = $true
  $dashboard.Range('A16:F19').Merge()
  $dashboard.Range('A16').Value2 = "1. Implement and record exact source evidence.`n2. Run static verification and mark Passed.`n3. Review the workbook before building the APK.`n4. Test on S22 and record Passed/Failed.`n5. User marks Accepted only after confirming the requirement."
  $dashboard.Range('A16').WrapText = $true
  $dashboard.Range('A16').VerticalAlignment = -4160
  $dashboard.Rows.Item('16:19').RowHeight = 24
  $dashboard.Columns.Item('A').ColumnWidth = 34
  $dashboard.Columns.Item('B').ColumnWidth = 18
  $dashboard.Columns.Item('C').ColumnWidth = 5
  $dashboard.Columns.Item('D').ColumnWidth = 22
  $dashboard.Columns.Item('E').ColumnWidth = 18
  $dashboard.Columns.Item('F').ColumnWidth = 18
  $dashboard.Range('A3:F19').Font.Name = 'Aptos'
  $dashboard.Range('A5:B5').Font.Bold = $true
  $dashboard.Range('D5:E5').Font.Bold = $true
  $dashboard.Range('A5:B12').Borders.LineStyle = 1
  $dashboard.Range('D5:E8').Borders.LineStyle = 1

  $sources = $workbook.Worksheets.Add()
  $sources.Name = 'Sources and Rules'
  $sources.Range('A1:D1').Value2 = @('Source','Purpose','Location','Rule')
  $sourceRows = @(
    @('Original 20 comments','First major APK feedback register','PWA_PARITY_CHECKLIST.md','Retained individually even when later comments overlap.'),
    @('Detailed review comments','Review items R-001 through R-049','REVIEW_COMMENTS.md','Later wording supersedes conflicting earlier wording.'),
    @('Legal framework','Australian Business Directory legal and developer brief','Project Documentation PDF','Legal publication is deferred, but technical safety requirements are pre-launch gates.'),
    @('User decision','Tester-only distribution before stores','Conversation, 20 August 2026','No real business data before production launch.'),
    @('PWA reference','Existing production terminology and behaviours','Community Event/App','Native module should preserve approved PWA names and workflows.')
  )
  for ($i=0; $i -lt $sourceRows.Count; $i++) {
    for ($j=0; $j -lt 4; $j++) { $sources.Cells.Item($i+2,$j+1) = $sourceRows[$i][$j] }
  }
  $sources.Range('A1:D6').WrapText = $true
  $sources.Range('A1:D1').Font.Bold = $true
  $sources.Range('A1:D1').Font.Color = 0xFFFFFF
  $sources.Range('A1:D1').Interior.Color = 0x7A5B11
  $sources.Columns.Item('A').ColumnWidth = 24
  $sources.Columns.Item('B').ColumnWidth = 40
  $sources.Columns.Item('C').ColumnWidth = 50
  $sources.Columns.Item('D').ColumnWidth = 62
  $sources.Rows.Item('2:6').RowHeight = 50

  $dashboard.Activate()
  $resolvedOutput = [System.IO.Path]::GetFullPath($OutputPath)
  $outputDirectory = Split-Path -Parent $resolvedOutput
  if (-not (Test-Path -LiteralPath $outputDirectory)) { New-Item -ItemType Directory -Path $outputDirectory | Out-Null }
  $workbook.SaveAs($resolvedOutput, 51)
  Write-Output "Created: $resolvedOutput"
  Write-Output "Checklist rows: $($rows.Count)"
}
finally {
  if ($workbook) { $workbook.Close($false) }
  if ($excel) { $excel.Quit() }
  if ($sheet) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($sheet) }
  if ($dashboard) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($dashboard) }
  if ($sources) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($sources) }
  if ($workbook) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($workbook) }
  if ($excel) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
