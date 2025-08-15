#!/usr/bin/env python3
"""
DoubleDouble Music Downloader
Script to automate downloading from your us.doubledouble.top service
"""

import requests
import time
import os
import zipfile
import argparse
from urllib.parse import urlparse
import re

class DoubleDoubleDownloader:
    def __init__(self):
        self.session = requests.Session()
        self.base_url = "https://us.doubledouble.top"
        self.download_folder = "./downloads"
        
        # Create download folder if it doesn't exist
        os.makedirs(self.download_folder, exist_ok=True)
        
        # Set headers to mimic browser
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
        })

    def download_song(self, tidal_url, format_type="flac", disable_pixeldrain=True):
        """
        Download a song from Tidal URL via doubledouble.top
        
        Args:
            tidal_url (str): The Tidal track URL
            format_type (str): Format preference ("flac", "mp3", "ogg")
            disable_pixeldrain (bool): Whether to disable pixeldrain upload
        """
        print(f"Downloading: {tidal_url}")
        
        try:
            # Get the main page first to establish session
            response = self.session.get(self.base_url)
            if response.status_code != 200:
                print(f"Failed to access website: {response.status_code}")
                return False
            
            # Extract any necessary tokens or form data from the page
            # This might need adjustment based on the actual form structure
            
            # Prepare form data
            form_data = {
                'url': tidal_url,
                'format': format_type,
            }
            
            # Add option to disable pixeldrain if checkbox exists
            if disable_pixeldrain:
                form_data['no_upload'] = '1'  # This might need adjustment
            
            # Submit the download request
            print("Submitting download request...")
            response = self.session.post(
                f"{self.base_url}/download",  # Adjust endpoint as needed
                data=form_data,
                allow_redirects=True
            )
            
            if response.status_code == 200:
                # Check if response contains a download link or file
                if 'application/zip' in response.headers.get('content-type', ''):
                    return self._save_zip_file(response, tidal_url)
                elif 'download' in response.text.lower():
                    return self._handle_download_page(response, tidal_url)
                else:
                    print("Unexpected response format")
                    return False
            else:
                print(f"Download request failed: {response.status_code}")
                return False
                
        except Exception as e:
            print(f"Error downloading song: {str(e)}")
            return False

    def _save_zip_file(self, response, tidal_url):
        """Save the zip file response and extract it"""
        try:
            # Generate filename from URL
            track_id = self._extract_track_id(tidal_url)
            zip_filename = f"{track_id}.zip"
            zip_path = os.path.join(self.download_folder, zip_filename)
            
            # Save zip file
            with open(zip_path, 'wb') as f:
                f.write(response.content)
            
            print(f"Downloaded zip file: {zip_filename}")
            
            # Extract zip file
            extract_folder = os.path.join(self.download_folder, track_id)
            with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                zip_ref.extractall(extract_folder)
            
            print(f"Extracted to: {extract_folder}")
            
            # List extracted files
            for file in os.listdir(extract_folder):
                print(f"  - {file}")
            
            return True
            
        except Exception as e:
            print(f"Error saving zip file: {str(e)}")
            return False

    def _handle_download_page(self, response, tidal_url):
        """Handle case where we get a page with download links"""
        # Parse the response to find download links
        # This would need to be implemented based on the actual HTML structure
        print("Received download page - manual implementation needed")
        return False

    def _extract_track_id(self, url):
        """Extract track ID from Tidal URL"""
        match = re.search(r'/track/(\d+)', url)
        if match:
            return match.group(1)
        return "unknown_track"

def main():
    parser = argparse.ArgumentParser(description='Download music from DoubleDouble.top')
    parser.add_argument('url', help='Tidal URL to download')
    parser.add_argument('--format', choices=['flac', 'mp3', 'ogg'], 
                       default='flac', help='Audio format preference')
    parser.add_argument('--enable-pixeldrain', action='store_true', 
                       help='Enable upload to pixeldrain (disabled by default)')
    parser.add_argument('--output-dir', default='./downloads', 
                       help='Output directory for downloads')
    
    args = parser.parse_args()
    
    downloader = DoubleDoubleDownloader()
    downloader.download_folder = args.output_dir
    
    success = downloader.download_song(
        args.url, 
        format_type=args.format,
        disable_pixeldrain=not args.enable_pixeldrain
    )
    
    if success:
        print("Download completed successfully!")
    else:
        print("Download failed!")

if __name__ == "__main__":
    main()