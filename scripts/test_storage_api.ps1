$loginBody = '{"username":"admin","password":"admin123"}'
$resp = Invoke-RestMethod -Uri 'http://localhost:7443/api/v1/auth/login' -Method Post -Body $loginBody -ContentType 'application/json'
$token = $resp.access_token
$headers = @{ Authorization = ("Bearer " + $token) }

# Test POST dataset
$newDs = @{ name = 'DATA/Projects'; pool = 'tank'; mount = 'E:\DATA\Projects'; quota_bytes = 107374182400 } | ConvertTo-Json
$createdDs = Invoke-RestMethod -Uri 'http://localhost:7443/api/v1/admin/datasets' -Method Post -Body $newDs -ContentType 'application/json' -Headers $headers
Write-Output ("CREATED DATASET: " + $createdDs.dataset.name + " ID=" + $createdDs.dataset.id)

# Test PATCH dataset
$updateDs = @{ quota_bytes = 214748364800; recordsize = '64K' } | ConvertTo-Json
$updatedDs = Invoke-RestMethod -Uri ('http://localhost:7443/api/v1/admin/datasets/' + $createdDs.dataset.id) -Method Patch -Body $updateDs -ContentType 'application/json' -Headers $headers
Write-Output ("UPDATED DATASET QUOTA: " + $updatedDs.dataset.quota_bytes + " RECORDSIZE=" + $updatedDs.dataset.recordsize)

# Test DELETE dataset
Invoke-RestMethod -Uri ('http://localhost:7443/api/v1/admin/datasets/' + $createdDs.dataset.id) -Method Delete -Headers $headers
Write-Output "DELETED DATASET SUCCESSFULLY"

# Test POST share
$newShare = @{ name = 'Projects'; purpose = 'Dự án nội bộ'; path = 'E:\DATA\Projects'; description = 'Chia sẻ dự án'; read_only = $false; browseable = $true } | ConvertTo-Json
$createdShare = Invoke-RestMethod -Uri 'http://localhost:7443/api/v1/admin/shares' -Method Post -Body $newShare -ContentType 'application/json' -Headers $headers
Write-Output ("CREATED SHARE: " + $createdShare.share.name + " ID=" + $createdShare.share.id)

# Test PATCH share
$updateShare = @{ description = 'Chia sẻ dự án đã cập nhật'; read_only = $true } | ConvertTo-Json
$updatedShare = Invoke-RestMethod -Uri ('http://localhost:7443/api/v1/admin/shares/' + $createdShare.share.id) -Method Patch -Body $updateShare -ContentType 'application/json' -Headers $headers
Write-Output ("UPDATED SHARE READONLY: " + $updatedShare.share.read_only)

# Test DELETE share
Invoke-RestMethod -Uri ('http://localhost:7443/api/v1/admin/shares/' + $createdShare.share.id) -Method Delete -Headers $headers
Write-Output "DELETED SHARE SUCCESSFULLY"

# Test Pool Scrub & Trim
$scrub = Invoke-RestMethod -Uri 'http://localhost:7443/api/v1/admin/pools/pool-tank/scrub' -Method Post -Headers $headers
Write-Output ("SCRUB STATUS: " + $scrub.status + " MSG=" + $scrub.message)

$trim = Invoke-RestMethod -Uri 'http://localhost:7443/api/v1/admin/pools/pool-tank/trim' -Method Post -Headers $headers
Write-Output ("TRIM STATUS: " + $trim.status + " MSG=" + $trim.message)
