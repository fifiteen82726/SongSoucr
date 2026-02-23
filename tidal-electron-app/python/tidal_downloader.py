#!/usr/bin/env python3

import requests
import argparse
import urllib.parse
import time
import json
import sys
import zipfile
import subprocess
import os
import shutil
from pathlib import Path

class MusicDownloader:
    def __init__(self, base_url="https://us.doubledouble.top"):
        self.base_url = base_url
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': f'{base_url}/',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-origin',
        })

    def _detect_service(self, url):
        """Detect which music service the URL belongs to"""
        try:
            parsed = urllib.parse.urlparse(url)
            host = parsed.netloc.lower()
            path = parsed.path.lower()
            query = parsed.query.lower()
        except Exception:
            host = url.lower()
            path = ""
            query = ""

        if 'tidal.com' in host:
            return 'tidal'

        if host == 'music.amazon.com' or host.endswith('.music.amazon.com'):
            return 'amazon'

        if host == 'amazon.com' or host == 'www.amazon.com' or host.endswith('.amazon.com'):
            if path.startswith('/music') or 'trackasin=' in query or 'musicterritory=' in query:
                return 'amazon'

        if 'music.amazon.com' in url.lower():
            return 'amazon'

        return None

    def _clean_tidal_url(self, tidal_url):
        """Clean Tidal URL by removing tracking parameters"""
        parsed = urllib.parse.urlparse(tidal_url)
        
        # Remove query parameters that are tracking/user-specific
        query_params = urllib.parse.parse_qs(parsed.query)
        
        # Keep only essential parameters, remove tracking ones like 'u'
        allowed_params = {}  # For now, remove all query parameters
        
        # Reconstruct the URL without tracking parameters
        clean_query = urllib.parse.urlencode(allowed_params, doseq=True)
        clean_url = urllib.parse.urlunparse((
            parsed.scheme,
            parsed.netloc,
            parsed.path,
            parsed.params,
            clean_query,
            parsed.fragment
        ))
        
        return clean_url

    def _clean_amazon_url(self, amazon_url):
        """Clean Amazon Music URL by removing tracking parameters"""
        parsed = urllib.parse.urlparse(amazon_url)
        
        # Remove query parameters that are tracking/user-specific
        query_params = urllib.parse.parse_qs(parsed.query)
        
        # Keep only essential parameters for Amazon Music
        allowed_params = {}
        if 'marketplaceId' in query_params:
            allowed_params['marketplaceId'] = query_params['marketplaceId']
        if 'musicTerritory' in query_params:
            allowed_params['musicTerritory'] = query_params['musicTerritory']
        if 'trackAsin' in query_params:
            allowed_params['trackAsin'] = query_params['trackAsin']
        
        # Reconstruct the URL without tracking parameters
        clean_query = urllib.parse.urlencode(allowed_params, doseq=True)
        clean_url = urllib.parse.urlunparse((
            parsed.scheme,
            parsed.netloc,
            parsed.path,
            parsed.params,
            clean_query,
            parsed.fragment
        ))
        
        return clean_url

    def download(
        self,
        url,
        format_type="flac",
        output_dir=".",
        convert_to_mp3=True,
        extract_zip=True,
        captcha_token=None,
        captcha_response=None
    ):
        """Download music from supported streaming services"""
        # Detect the service
        service = self._detect_service(url)
        if not service:
            print("❌ Unsupported URL. Please provide a Tidal or Amazon Music URL")
            return False
        
        # Clean the URL by removing tracking parameters
        if service == 'tidal':
            clean_url = self._clean_tidal_url(url)
            print(f"🎵 Tidal download detected")
        elif service == 'amazon':
            clean_url = self._clean_amazon_url(url)
            print(f"🎵 Amazon Music download detected")
        
        print(f"Starting download for: {clean_url}")
        print(f"Format: {format_type}")
        
        # Step 1: Initiate download and get ID
        dl_url = f"{self.base_url}/dl"
        params = {
            'url': clean_url,
            'format': format_type
        }

        if captcha_response:
            params['captcha'] = captcha_response
        elif captcha_token:
            params['token'] = captcha_token
        
        try:
            response = self.session.get(dl_url, params=params)
            response.raise_for_status()
            
            
            data = response.json()
            if not data.get('success') or 'id' not in data:
                error_message = data.get('error', str(data))
                print(f"Failed to initiate download: {error_message}")

                if isinstance(error_message, str) and 'captcha is required to continue' in error_message.lower():
                    handoff_url = f"{self.base_url}/?url={urllib.parse.quote(clean_url, safe='')}"
                    print("CAPTCHA is required by DoubleDouble for API access.")
                    print(f"Open in browser: {handoff_url}")

                return False
                
            download_id = data['id']
            print(f"Download initiated with ID: {download_id}")
            
            # Step 2: Poll for completion and download
            zip_path = self._poll_for_completion(download_id, output_dir)
            if not zip_path:
                return False

            # Step 3: Handle conversion for direct downloads or ZIP files
            file_path = Path(zip_path)

            # Check if we got a direct audio file (not a ZIP)
            if file_path.suffix.lower() in ['.flac', '.ogg', '.wav', '.m4a', '.mp3']:
                print(f"Direct audio file detected: {file_path}")
                if convert_to_mp3 and file_path.suffix.lower() != '.mp3':
                    print(f"Converting direct file to MP3...")
                    mp3_files = self._convert_to_mp3([str(file_path)], output_dir)
                    if mp3_files:
                        # Remove original file after successful conversion
                        try:
                            os.remove(file_path)
                            print(f"Removed original file: {file_path.name}")
                        except Exception as e:
                            print(f"Could not remove original file: {e}")
                elif not convert_to_mp3:
                    print(f"Keeping original format: {file_path.suffix}")
            elif extract_zip:
                # Handle ZIP files as before
                extracted_files = self._extract_zip(zip_path, output_dir)
                if convert_to_mp3 and extracted_files:
                    mp3_files = self._convert_to_mp3(extracted_files, output_dir)
                    self._cleanup_files(zip_path, extracted_files, mp3_files, output_dir)
                elif not convert_to_mp3:
                    # If not converting to MP3, just remove the ZIP file
                    try:
                        if os.path.exists(zip_path):
                            os.remove(zip_path)
                            print(f"Removed: {Path(zip_path).name}")
                    except Exception as e:
                        print(f"Could not remove ZIP file: {e}")

            return True
                
        except requests.RequestException as e:
            print(f"Error making request: {e}")
            return False
        except json.JSONDecodeError as e:
            print(f"Invalid JSON response: {e}")
            print(f"Response text was: {response.text}")
            return False

    def _poll_for_completion(self, download_id, output_dir, max_attempts=30):
        """Poll the server for completion status"""
        for attempt in range(max_attempts):
            time.sleep(2)
            print(f"Checking status... (attempt {attempt + 1}/{max_attempts})")
            
            try:
                response = self.session.get(f"{self.base_url}/dl/{download_id}")
                response.raise_for_status()
                
                data = response.json()
                status = data.get('status', '')
                friendly_status = data.get('friendlyStatus', status)
                print(f"Status: {friendly_status}")
                
                if status == 'done':
                    if 'url' in data:
                        zip_path = self._download_file(data['url'], output_dir)
                        return zip_path if zip_path else False
                    else:
                        print("Download marked as done but no URL provided")
                        return False
                elif status == 'error':
                    error_msg = data.get('error', data.get('friendlyStatus', 'Unknown error'))
                    message = data.get('message', '')
                    
                    print(f"❌ Download failed: {error_msg}")
                    
                    if 'extractor error' in message.lower():
                        print("🔧 This is a service-side issue with extracting this specific track.")
                        print("💡 Try:")
                        print("   • A different track from the same artist")
                        print("   • The same track later (temporary issue)")
                        print("   • Check if the track is available in your region")
                    elif message:
                        print(f"Details: {message}")
                        
                    return False
                    
            except requests.RequestException as e:
                print(f"Error polling status: {e}")
                continue
            except json.JSONDecodeError:
                print("Invalid response format")
                continue
                
        print("Timeout waiting for download completion")
        return False

    def _download_file(self, file_url, output_dir):
        """Download the actual file"""
        if file_url.startswith('./'):
            file_url = f"{self.base_url}/{file_url[2:]}"
        elif file_url.startswith('/'):
            file_url = f"{self.base_url}{file_url}"
            
        print(f"Downloading file from: {file_url}")
        
        try:
            response = self.session.get(file_url, stream=True)
            response.raise_for_status()
            
            # Get filename from Content-Disposition or URL
            filename = self._get_filename(response, file_url)
            output_path = Path(output_dir) / filename
            
            # Download with progress
            total_size = int(response.headers.get('content-length', 0))
            downloaded = 0
            
            with open(output_path, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)
                        downloaded += len(chunk)
                        if total_size > 0:
                            progress = (downloaded / total_size) * 100
                            print(f"\rProgress: {progress:.1f}%", end='', flush=True)
            
            print(f"\nDownload completed: {output_path}")
            return str(output_path)
            
        except requests.RequestException as e:
            print(f"Error downloading file: {e}")
            return False

    def _save_response(self, response, output_dir, tidal_url):
        """Save direct response content"""
        filename = self._get_filename(response, tidal_url)
        output_path = Path(output_dir) / filename
        
        with open(output_path, 'wb') as f:
            f.write(response.content)
        
        print(f"Downloaded: {output_path}")
        return str(output_path)

    def _get_filename(self, response, fallback_url):
        """Extract filename from response or URL"""
        import urllib.parse

        # Try Content-Disposition header
        cd = response.headers.get('content-disposition', '')
        if 'filename=' in cd:
            # Handle both regular filename and filename* (RFC 5987)
            if "filename*=UTF-8''" in cd:
                # Extract UTF-8 encoded filename
                filename = cd.split("filename*=UTF-8''")[1].split(';')[0]
                filename = urllib.parse.unquote(filename)
            else:
                # Regular filename
                filename = cd.split('filename=')[1].split(';')[0].strip('"\'')
                # Remove any HTTP header artifacts
                if '"; filename*=' in filename:
                    filename = filename.split('"; filename*=')[0]

            # Clean up any remaining artifacts and decode properly
            filename = filename.replace('"', '').replace("'", '').strip()
            return filename

        # Fall back to URL-based name
        if fallback_url.endswith('.zip'):
            return Path(fallback_url).name

        # Default filename
        return "download.zip"
    
    def _extract_zip(self, zip_path, output_dir):
        """Extract ZIP file and return list of extracted files"""
        extracted_files = []
        extract_dir = Path(output_dir) / "extracted"
        extract_dir.mkdir(exist_ok=True)
        
        try:
            with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                print(f"Extracting {zip_path}...")
                zip_ref.extractall(extract_dir)
                
                for file_info in zip_ref.infolist():
                    extracted_path = extract_dir / file_info.filename
                    if extracted_path.exists() and extracted_path.is_file():
                        extracted_files.append(str(extracted_path))
                        print(f"Extracted: {extracted_path.name}")
                        
        except zipfile.BadZipFile:
            print(f"Error: {zip_path} is not a valid ZIP file")
            return []
        except Exception as e:
            print(f"Error extracting ZIP: {e}")
            return []
            
        return extracted_files
    
    def _convert_to_mp3(self, file_paths, output_dir):
        """Convert FLAC files to 320kbps MP3"""
        output_path = Path(output_dir)
        mp3_files = []
        
        for file_path in file_paths:
            file_path = Path(file_path)
            
            # Only convert audio files (FLAC, OGG, etc.)
            if file_path.suffix.lower() in ['.flac', '.ogg', '.wav', '.m4a']:
                mp3_path = output_path / f"{file_path.stem}.mp3"
                
                print(f"Converting {file_path.name} to 320kbps MP3...")
                
                try:
                    # Use ffmpeg to convert to true 320kbps CBR MP3 (audio only, no artwork)
                    subprocess.run([
                        'ffmpeg', '-i', str(file_path),
                        '-map', '0:a',  # Only map audio streams
                        '-codec:a', 'libmp3lame',
                        '-b:a', '320k',
                        '-minrate', '320k',  # Force constant bitrate
                        '-maxrate', '320k',
                        '-bufsize', '320k',
                        '-ac', '2',  # Stereo
                        '-ar', '48000',  # Keep original sample rate for quality
                        '-y',  # Overwrite output file
                        str(mp3_path)
                    ], check=True, capture_output=True, text=True)
                    
                    print(f"Converted to: {mp3_path}")
                    mp3_files.append(str(mp3_path))
                    
                except subprocess.CalledProcessError as e:
                    print(f"Error converting {file_path.name}: {e}")
                    if e.stderr:
                        print(f"FFmpeg error: {e.stderr}")
                except FileNotFoundError:
                    print("Error: ffmpeg not found. Please install ffmpeg to convert audio files.")
                    print("Install with: brew install ffmpeg")
                    
        return mp3_files
    
    def _cleanup_files(self, zip_path, extracted_files, mp3_files, output_dir):
        """Clean up temporary files, keep only MP3s in output directory"""
        
        print("Cleaning up temporary files...")
        
        # Remove the original ZIP file
        try:
            if os.path.exists(zip_path):
                os.remove(zip_path)
                print(f"Removed: {Path(zip_path).name}")
        except Exception as e:
            print(f"Could not remove ZIP file: {e}")
        
        # Remove the extracted directory and all its contents
        extract_dir = Path(output_dir) / "extracted"
        try:
            if extract_dir.exists():
                shutil.rmtree(extract_dir)
                print(f"Removed: extracted/ directory")
        except Exception as e:
            print(f"Could not remove extracted directory: {e}")
        
        print(f"Cleanup complete. Final MP3 files in {output_dir}:")
        for mp3_file in mp3_files:
            mp3_path = Path(mp3_file)
            if mp3_path.exists():
                print(f"  ✅ {mp3_path.name} ({mp3_path.stat().st_size / (1024*1024):.1f}MB)")

def main():
    parser = argparse.ArgumentParser(description='Download music from Tidal and Amazon Music using doubledouble.top')
    parser.add_argument('url', help='Tidal or Amazon Music URL to download')
    parser.add_argument('-f', '--format', default='flac', choices=['ogg', 'mp3', 'flac'],
                       help='Audio format (default: flac)')
    parser.add_argument('-o', '--output', default='.', 
                       help='Output directory (default: current directory)')
    parser.add_argument('--base-url', default='https://us.doubledouble.top',
                       help='Base URL for the download service')
    parser.add_argument('--no-mp3', action='store_true',
                       help='Keep original format instead of converting to MP3')
    parser.add_argument('--no-extract', action='store_true',
                       help='Don\'t extract ZIP file')
    parser.add_argument('--captcha-token', default='',
                       help='DoubleDouble CAPTCHA bypass token (optional)')
    parser.add_argument('--captcha-response', default='',
                       help='Raw CAPTCHA response token (optional)')
    
    args = parser.parse_args()
    
    downloader = MusicDownloader(args.base_url)

    # Validate URL
    if not downloader._detect_service(args.url):
        print("Error: Please provide a valid Tidal or Amazon Music URL")
        sys.exit(1)

    success = downloader.download(
        args.url, 
        args.format, 
        args.output,
        convert_to_mp3=not args.no_mp3,
        extract_zip=not args.no_extract,
        captcha_token=args.captcha_token or None,
        captcha_response=args.captcha_response or None
    )
    
    if not success:
        print("Download failed")
        sys.exit(1)
    
    print("Download completed successfully!")

if __name__ == '__main__':
    main()
