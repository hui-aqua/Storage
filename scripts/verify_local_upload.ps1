$ErrorActionPreference = 'Stop'
$base = 'http://127.0.0.1:8000'
$headers = @{ Authorization = 'Bearer dev-test-key' }
[void][Reflection.Assembly]::LoadWithPartialName('System.Net.Http')
$file = Resolve-Path 'data/samples/test-5mb.bin'
$client = [System.Net.Http.HttpClient]::new()
$client.DefaultRequestHeaders.Authorization = [System.Net.Http.Headers.AuthenticationHeaderValue]::new('Bearer', 'dev-test-key')
$form = [System.Net.Http.MultipartFormDataContent]::new()
foreach ($entry in @{
    device_id = 'device_001'
    timestamp = '2026-11-10T08:00:00Z'
    sampling_frequency = '50'
    measurement_type = 'acceleration'
    file_format = 'binary'
}.GetEnumerator()) {
    $form.Add([System.Net.Http.StringContent]::new($entry.Value), $entry.Key)
}
$stream = [System.IO.File]::OpenRead($file)
$fileContent = [System.Net.Http.StreamContent]::new($stream)
$fileContent.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::new('application/octet-stream')
$form.Add($fileContent, 'file', [System.IO.Path]::GetFileName($file))
$response = $client.PostAsync("$base/api/v1/upload", $form).GetAwaiter().GetResult()
$body = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
if (-not $response.IsSuccessStatusCode) { throw "Upload failed ($($response.StatusCode)): $body" }
$body | ConvertFrom-Json | ConvertTo-Json -Depth 5
$stream.Dispose()
$client.Dispose()
