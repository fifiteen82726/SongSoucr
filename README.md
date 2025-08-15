# Tidal Downloader

A command-line tool to download music from Tidal using the doubledouble.top service with automatic ZIP extraction and MP3 conversion.

## Features

- ✅ Downloads from Tidal URLs
- ✅ Supports multiple formats (OGG, MP3, FLAC)
- ✅ Automatic ZIP extraction
- ✅ FLAC to 320kbps MP3 conversion
- ✅ Progress tracking

## Usage

```bash
# Basic download (FLAC format, auto-extract)
python3 tidal_downloader.py "https://tidal.com/browse/track/440500111?u"

# Download and convert to 320kbps MP3
python3 tidal_downloader.py --mp3 "https://tidal.com/browse/track/440500111?u"

# Specify output directory and format
python3 tidal_downloader.py -f flac -o ~/Downloads --mp3 "https://tidal.com/browse/track/440500111?u"
```

## Options

- `-f, --format`: Audio format (`ogg`, `mp3`, `flac`) - default: `flac`
- `-o, --output`: Output directory - default: current directory
- `--mp3`: Convert downloaded FLAC to 320kbps MP3
- `--no-extract`: Don't extract ZIP file (keep as ZIP)
- `--base-url`: Base URL for download service - default: `https://us.doubledouble.top`

## Requirements

- Python 3.6+
- `ffmpeg` (for MP3 conversion): `brew install ffmpeg`

## Examples

```bash
# Download FLAC and convert to MP3
python3 tidal_downloader.py --mp3 "https://tidal.com/browse/track/440500111?u"

# Download to specific folder
python3 tidal_downloader.py -o ~/Music --mp3 "https://tidal.com/browse/track/440500111?u"

# Keep as ZIP file (no extraction)
python3 tidal_downloader.py --no-extract "https://tidal.com/browse/track/440500111?u"
```

## Process

1. Submit URL to download service
2. Poll for completion status
3. Download ZIP file containing audio + metadata
4. Extract ZIP file (unless `--no-extract`)
5. Convert to 320kbps MP3 (if `--mp3` flag used)
6. Clean up temporary files (removes ZIP and extracted files, keeps only final MP3)