$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

function New-RoundedRectanglePath {
    param(
        [float]$X,
        [float]$Y,
        [float]$Width,
        [float]$Height,
        [float]$Radius
    )

    $Diameter = $Radius * 2
    $Path = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $Path.AddArc($X, $Y, $Diameter, $Diameter, 180, 90)
    $Path.AddArc($X + $Width - $Diameter, $Y, $Diameter, $Diameter, 270, 90)
    $Path.AddArc($X + $Width - $Diameter, $Y + $Height - $Diameter, $Diameter, $Diameter, 0, 90)
    $Path.AddArc($X, $Y + $Height - $Diameter, $Diameter, $Diameter, 90, 90)
    $Path.CloseFigure()
    return $Path
}

function New-QuotaHushIcon {
    param(
        [int]$Size,
        [string]$Destination
    )

    $Scale = $Size / 128.0
    $Bitmap = [System.Drawing.Bitmap]::new($Size, $Size)
    $Graphics = [System.Drawing.Graphics]::FromImage($Bitmap)

    try {
        $Graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
        $Graphics.Clear([System.Drawing.Color]::Transparent)

        $BackgroundPath = New-RoundedRectanglePath (4 * $Scale) (4 * $Scale) (120 * $Scale) (120 * $Scale) (28 * $Scale)
        try {
            $BackgroundBrush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml("#081019"))
            $BorderPen = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml("#213343"), [Math]::Max(1, 4 * $Scale))
            try {
                $Graphics.FillPath($BackgroundBrush, $BackgroundPath)
                $Graphics.DrawPath($BorderPen, $BackgroundPath)
            } finally {
                $BackgroundBrush.Dispose()
                $BorderPen.Dispose()
            }
        } finally {
            $BackgroundPath.Dispose()
        }

        $Bars = @(
            @{ Y = 38; End = 100; Color = "#62E6D4" },
            @{ Y = 64; End = 80; Color = "#48A8E8" },
            @{ Y = 90; End = 60; Color = "#7C6BF2" }
        )

        foreach ($Bar in $Bars) {
            $Pen = [System.Drawing.Pen]::new(
                [System.Drawing.ColorTranslator]::FromHtml($Bar.Color),
                [Math]::Max(1.5, 14 * $Scale)
            )
            try {
                $Pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
                $Pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
                $Graphics.DrawLine($Pen, 28 * $Scale, $Bar.Y * $Scale, $Bar.End * $Scale, $Bar.Y * $Scale)
            } finally {
                $Pen.Dispose()
            }
        }

        $Directory = Split-Path -Parent $Destination
        New-Item -ItemType Directory -Path $Directory -Force | Out-Null
        $Bitmap.Save($Destination, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
        $Graphics.Dispose()
        $Bitmap.Dispose()
    }
}

function New-QuotaHushIconFile {
    param(
        [array]$Images,
        [string]$Destination
    )

    $ImageData = foreach ($Image in $Images) {
        [pscustomobject]@{
            Size = $Image.Size
            Bytes = [System.IO.File]::ReadAllBytes($Image.Path)
        }
    }

    $Stream = [System.IO.File]::Open($Destination, [System.IO.FileMode]::Create)
    $Writer = [System.IO.BinaryWriter]::new($Stream)
    try {
        $Writer.Write([uint16]0)
        $Writer.Write([uint16]1)
        $Writer.Write([uint16]$ImageData.Count)

        $Offset = 6 + (16 * $ImageData.Count)
        foreach ($Image in $ImageData) {
            $Writer.Write([byte]$Image.Size)
            $Writer.Write([byte]$Image.Size)
            $Writer.Write([byte]0)
            $Writer.Write([byte]0)
            $Writer.Write([uint16]1)
            $Writer.Write([uint16]32)
            $Writer.Write([uint32]$Image.Bytes.Length)
            $Writer.Write([uint32]$Offset)
            $Offset += $Image.Bytes.Length
        }

        foreach ($Image in $ImageData) {
            $Writer.Write($Image.Bytes)
        }
    } finally {
        $Writer.Dispose()
        $Stream.Dispose()
    }
}

$RepositoryRoot = Split-Path -Parent $PSScriptRoot

New-QuotaHushIcon 16 (Join-Path $RepositoryRoot "extension\icons\icon16.png")
New-QuotaHushIcon 48 (Join-Path $RepositoryRoot "extension\icons\icon48.png")
New-QuotaHushIcon 128 (Join-Path $RepositoryRoot "extension\icons\icon128.png")
New-QuotaHushIcon 128 (Join-Path $RepositoryRoot "vscode-extension\media\icon.png")
New-QuotaHushIcon 128 (Join-Path $RepositoryRoot "docs\assets\icon.png")
New-QuotaHushIconFile @(
    @{ Size = 16; Path = (Join-Path $RepositoryRoot "extension\icons\icon16.png") },
    @{ Size = 48; Path = (Join-Path $RepositoryRoot "extension\icons\icon48.png") },
    @{ Size = 128; Path = (Join-Path $RepositoryRoot "extension\icons\icon128.png") }
) (Join-Path $RepositoryRoot "installer\windows\quotahush.ico")

Write-Host "QuotaHush icons generated."
