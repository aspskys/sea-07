param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$CliArgs
)

$ErrorActionPreference = "Stop"

if ($env:OS -ne "Windows_NT" -and $IsWindows -ne $true) {
  throw "starry-cli.ps1 is for Windows; use scripts/starry-cli.sh on macOS/Linux."
}

$CdnBase = $env:STARRY_CLI_CDN_BASE
if ([string]::IsNullOrWhiteSpace($CdnBase)) {
  $CdnBase = "https://cdn1.platform-test-cdn.allstarunion.com/static/upload"
}
$CdnBase = $CdnBase.TrimEnd("/")

function Get-ArtifactUrl {
  $artifact = "starry-cli-windows-$(Get-StarryArch).exe"
  if (-not [string]::IsNullOrWhiteSpace($env:STARRY_CLI_CACHE_BUSTER)) {
    return "$CdnBase/$artifact" + "?v=" + [System.Uri]::EscapeDataString($env:STARRY_CLI_CACHE_BUSTER.Trim())
  }
  $timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
  return "$CdnBase/$artifact" + "?t=$timestamp"
}

function Get-DefaultBinDir {
  if (-not [string]::IsNullOrWhiteSpace($env:STARRY_CLI_BIN_DIR)) {
    return $env:STARRY_CLI_BIN_DIR
  }

  $localAppData = $env:LOCALAPPDATA
  if ([string]::IsNullOrWhiteSpace($localAppData)) {
    $localAppData = Join-Path $env:USERPROFILE "AppData\Local"
  }
  return (Join-Path $localAppData "Programs\starry-cli\bin")
}

function Get-StarryArch {
  $arch = $env:PROCESSOR_ARCHITECTURE
  if ([string]::IsNullOrWhiteSpace($arch)) {
    $arch = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString()
  }

  switch -Regex ($arch) {
    "^(AMD64|X64|X86)$" { return "amd64" }
    "^ARM64$" { return "amd64" }
    default { throw "unsupported Windows architecture: $arch" }
  }
}

function Test-ZoneIdentifier {
  param([string]$Path)

  try {
    $stream = Get-Item -LiteralPath $Path -Stream Zone.Identifier -ErrorAction SilentlyContinue
    return $null -ne $stream
  } catch {
    return $false
  }
}

function Write-UnblockHint {
  param([string]$Path)

  [Console]::Error.WriteLine(@"
错误：Windows 阻止了 starry-cli 运行，文件可能来自互联网下载：$Path

请复制执行下面的命令后重试：
  Unblock-File -LiteralPath "$Path"
"@)
}

function Assert-Runnable {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    return $false
  }
  if (Test-ZoneIdentifier -Path $Path) {
    Write-UnblockHint -Path $Path
    exit 126
  }
  return $true
}

function Add-UserPath {
  param([string]$Dir)

  try {
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $entries = @()
    if (-not [string]::IsNullOrWhiteSpace($userPath)) {
      $entries = $userPath -split ";"
    }
    if ($entries | Where-Object { $_ -ieq $Dir }) {
      return
    }

    $nextPath = if ([string]::IsNullOrWhiteSpace($userPath)) { $Dir } else { "$userPath;$Dir" }
    [Environment]::SetEnvironmentVariable("Path", $nextPath, "User")
    if (-not (($env:Path -split ";") | Where-Object { $_ -ieq $Dir })) {
      $env:Path = "$env:Path;$Dir"
    }
    [Console]::Error.WriteLine("starry-cli 已加入 Windows 用户 PATH：$Dir")
    [Console]::Error.WriteLine("如果桌面应用暂时找不到 starry-cli，请重启该应用后再试。")
  } catch {
    [Console]::Error.WriteLine("提示：starry-cli 已安装，但写入 Windows 用户 PATH 失败。")
    [Console]::Error.WriteLine("安装目录：$Dir")
    [Console]::Error.WriteLine("当前会继续使用绝对路径执行，不影响本次命令。")
    [Console]::Error.WriteLine("如需在终端直接执行 starry-cli，可手动把上面的目录加入用户 PATH。")
  }
}

function Install-StarryBinary {
  param(
    [string]$DestinationPath,
    [string]$ActionText
  )

  $destDir = Split-Path -Parent $DestinationPath
  if ([string]::IsNullOrWhiteSpace($destDir)) {
    $destDir = "."
  }
  New-Item -ItemType Directory -Path $destDir -Force | Out-Null

  $url = Get-ArtifactUrl
  $tmpPath = Join-Path ([System.IO.Path]::GetTempPath()) ("starry-cli-" + [System.Guid]::NewGuid() + ".exe")

  [Console]::Error.WriteLine("${ActionText}：${url}")
  try {
    Invoke-WebRequest -Uri $url -OutFile $tmpPath -UseBasicParsing
    if (-not (Test-Path -LiteralPath $tmpPath -PathType Leaf) -or (Get-Item -LiteralPath $tmpPath).Length -le 0) {
      throw "下载的 starry-cli 文件为空：$url"
    }
    try {
      Unblock-File -LiteralPath $tmpPath -ErrorAction SilentlyContinue
    } catch {
      Write-UnblockHint -Path $tmpPath
      exit 126
    }
    Move-Item -LiteralPath $tmpPath -Destination $DestinationPath -Force
    [Console]::Error.WriteLine("starry-cli 已安装到：$DestinationPath")
    Add-UserPath -Dir $destDir
  } finally {
    Remove-Item -LiteralPath $tmpPath -Force -ErrorAction SilentlyContinue
  }
}

$binDir = Get-DefaultBinDir
$binPath = Join-Path $binDir "starry-cli.exe"

if ($CliArgs.Count -gt 0 -and $CliArgs[0] -eq "upgrade") {
  $targetPath = $binPath
  if ([string]::IsNullOrWhiteSpace($env:STARRY_CLI_BIN_DIR)) {
    $pathCommand = Get-Command "starry-cli.exe" -ErrorAction SilentlyContinue
    if ($null -eq $pathCommand) {
      $pathCommand = Get-Command "starry-cli" -ErrorAction SilentlyContinue
    }
    if ($null -ne $pathCommand) {
      $targetPath = $pathCommand.Source
    }
  }
  Install-StarryBinary -DestinationPath $targetPath -ActionText "正在升级 starry-cli"
  exit 0
}

$pathCommand = Get-Command "starry-cli.exe" -ErrorAction SilentlyContinue
if ($null -eq $pathCommand) {
  $pathCommand = Get-Command "starry-cli" -ErrorAction SilentlyContinue
}
if ($null -ne $pathCommand -and (Assert-Runnable -Path $pathCommand.Source)) {
  & $pathCommand.Source @CliArgs
  exit $LASTEXITCODE
}

if (-not (Assert-Runnable -Path $binPath)) {
  Install-StarryBinary -DestinationPath $binPath -ActionText "未找到 starry-cli，正在下载"
}

if (-not (Assert-Runnable -Path $binPath)) {
  throw "starry-cli is not runnable: $binPath"
}

& $binPath @CliArgs
exit $LASTEXITCODE
