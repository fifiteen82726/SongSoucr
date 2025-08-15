#!/usr/bin/env python3

import tkinter as tk
from tkinter import filedialog, messagebox, simpledialog
import json
import os
import threading
import time
from pathlib import Path
from tidal_downloader import TidalDownloader

class SimpleTidalGUI:
    def __init__(self, root):
        self.root = root
        self.root.title("Tidal Downloader")
        self.root.geometry("800x700")
        
        # Try to force light mode
        self.root.configure(bg='white')
        
        # Load preferences
        self.preferences_file = Path.home() / ".tidal_downloader_prefs.json"
        self.load_preferences()
        
        # Initialize downloader
        self.downloader = TidalDownloader()
        
        # Create GUI
        self.create_simple_gui()
        
        # Apply preferences
        self.apply_preferences()
        
    def load_preferences(self):
        """Load preferences"""
        self.prefs = {
            "download_path": str(Path.home() / "Downloads"),
            "format": "mp3_320",
            "last_url": ""
        }
        
        if self.preferences_file.exists():
            try:
                with open(self.preferences_file, 'r') as f:
                    saved_prefs = json.load(f)
                    self.prefs.update(saved_prefs)
            except:
                pass
    
    def save_preferences(self):
        """Save preferences"""
        try:
            with open(self.preferences_file, 'w') as f:
                json.dump(self.prefs, f, indent=2)
        except:
            pass
    
    def create_simple_gui(self):
        """Create simple GUI that works on all systems"""
        
        # Main container - force white background
        main = tk.Frame(self.root, bg='white', padx=40, pady=30)
        main.pack(fill=tk.BOTH, expand=True)
        
        # Title with large font
        title = tk.Label(main, 
                        text="🎵 TIDAL DOWNLOADER",
                        font=('Arial', 28, 'bold'),
                        bg='white',
                        fg='black')
        title.pack(pady=(0, 40))
        
        # URL Section with explicit styling
        url_section = tk.LabelFrame(main, 
                                   text="  🔗 PASTE TIDAL URL HERE  ",
                                   font=('Arial', 16, 'bold'),
                                   bg='#f0f0f0',
                                   fg='black',
                                   padx=20,
                                   pady=20)
        url_section.pack(fill=tk.X, pady=(0, 30))
        
        # Create a button that opens URL input dialog
        self.url_display = tk.Label(url_section,
                                   text="Click 'Set URL' to paste your Tidal link",
                                   font=('Arial', 12),
                                   bg='white',
                                   fg='black',
                                   relief=tk.SUNKEN,
                                   padx=10,
                                   pady=15,
                                   wraplength=600,
                                   justify=tk.LEFT)
        self.url_display.pack(fill=tk.X, pady=(0, 15))
        
        url_btn = tk.Button(url_section,
                           text="📝 SET URL",
                           command=self.set_url_dialog,
                           font=('Arial', 14, 'bold'),
                           bg='#007AFF',
                           fg='white',
                           padx=20,
                           pady=10)
        url_btn.pack()
        
        # Format Selection
        format_section = tk.LabelFrame(main,
                                      text="  🎧 CHOOSE AUDIO FORMAT  ",
                                      font=('Arial', 16, 'bold'),
                                      bg='#e8f4fd',
                                      fg='black',
                                      padx=20,
                                      pady=20)
        format_section.pack(fill=tk.X, pady=(0, 30))
        
        self.format_var = tk.StringVar(value="mp3_320")
        
        # Format options with larger buttons
        formats_frame = tk.Frame(format_section, bg='#e8f4fd')
        formats_frame.pack()
        
        mp3_btn = tk.Radiobutton(formats_frame,
                                text="🎵 MP3 320kbps (Perfect for DJing)",
                                variable=self.format_var,
                                value="mp3_320",
                                font=('Arial', 14, 'bold'),
                                bg='white',
                                fg='#007AFF',
                                selectcolor='white',
                                padx=20,
                                pady=15,
                                relief=tk.RAISED,
                                indicatoron=0)
        mp3_btn.pack(fill=tk.X, pady=(0, 10))
        
        flac_btn = tk.Radiobutton(formats_frame,
                                 text="💎 FLAC Lossless (Highest Quality)",
                                 variable=self.format_var,
                                 value="flac",
                                 font=('Arial', 14),
                                 bg='white',
                                 fg='black',
                                 selectcolor='white',
                                 padx=20,
                                 pady=15,
                                 relief=tk.RAISED,
                                 indicatoron=0)
        flac_btn.pack(fill=tk.X)
        
        # Download Location
        location_section = tk.LabelFrame(main,
                                        text="  📁 DOWNLOAD LOCATION  ",
                                        font=('Arial', 16, 'bold'),
                                        bg='#f0f8f0',
                                        fg='black',
                                        padx=20,
                                        pady=20)
        location_section.pack(fill=tk.X, pady=(0, 30))
        
        self.path_display = tk.Label(location_section,
                                    text="No folder selected",
                                    font=('Arial', 12),
                                    bg='white',
                                    fg='black',
                                    relief=tk.SUNKEN,
                                    padx=10,
                                    pady=15,
                                    wraplength=600,
                                    justify=tk.LEFT)
        self.path_display.pack(fill=tk.X, pady=(0, 15))
        
        browse_btn = tk.Button(location_section,
                              text="📂 CHOOSE FOLDER",
                              command=self.browse_folder,
                              font=('Arial', 14, 'bold'),
                              bg='#34C759',
                              fg='white',
                              padx=20,
                              pady=10)
        browse_btn.pack()
        
        # Progress Section
        progress_section = tk.LabelFrame(main,
                                        text="  ⏳ DOWNLOAD PROGRESS  ",
                                        font=('Arial', 16, 'bold'),
                                        bg='#fff8e7',
                                        fg='black',
                                        padx=20,
                                        pady=20)
        progress_section.pack(fill=tk.X, pady=(0, 30))
        
        # Simple progress display
        self.progress_text = tk.Label(progress_section,
                                     text="Ready to download! 🎵",
                                     font=('Arial', 14),
                                     bg='white',
                                     fg='black',
                                     padx=20,
                                     pady=20,
                                     relief=tk.SUNKEN,
                                     wraplength=600)
        self.progress_text.pack(fill=tk.X)
        
        # Action Buttons
        button_frame = tk.Frame(main, bg='white')
        button_frame.pack(pady=30)
        
        self.download_btn = tk.Button(button_frame,
                                     text="🚀 START DOWNLOAD",
                                     command=self.start_download,
                                     font=('Arial', 18, 'bold'),
                                     bg='#007AFF',
                                     fg='white',
                                     padx=40,
                                     pady=20,
                                     relief=tk.RAISED)
        self.download_btn.pack(side=tk.LEFT, padx=(0, 20))
        
        self.cancel_btn = tk.Button(button_frame,
                                   text="❌ CANCEL",
                                   command=self.cancel_download,
                                   font=('Arial', 18, 'bold'),
                                   bg='#FF3B30',
                                   fg='white',
                                   padx=40,
                                   pady=20,
                                   relief=tk.RAISED,
                                   state=tk.DISABLED)
        self.cancel_btn.pack(side=tk.LEFT)
        
        # State variables
        self.url_value = ""
        self.path_value = ""
        self.download_thread = None
        self.cancel_flag = False
        
    def set_url_dialog(self):
        """Open dialog to set URL"""
        url = simpledialog.askstring("Tidal URL", 
                                    "Paste your Tidal URL here:",
                                    initialvalue=self.url_value)
        if url:
            self.url_value = url.strip()
            display_url = url[:80] + "..." if len(url) > 80 else url
            self.url_display.config(text=f"URL: {display_url}")
            self.prefs["last_url"] = self.url_value
            self.save_preferences()
    
    def browse_folder(self):
        """Browse for folder"""
        folder = filedialog.askdirectory(initialdir=self.path_value or str(Path.home()))
        if folder:
            self.path_value = folder
            display_path = folder[-60:] if len(folder) > 60 else folder
            self.path_display.config(text=f"📁 {display_path}")
            self.prefs["download_path"] = folder
            self.save_preferences()
    
    def apply_preferences(self):
        """Apply saved preferences"""
        # Set URL if exists
        if self.prefs.get("last_url"):
            self.url_value = self.prefs["last_url"]
            display_url = self.url_value[:80] + "..." if len(self.url_value) > 80 else self.url_value
            self.url_display.config(text=f"URL: {display_url}")
        
        # Set path if exists
        if self.prefs.get("download_path"):
            self.path_value = self.prefs["download_path"]
            display_path = self.path_value[-60:] if len(self.path_value) > 60 else self.path_value
            self.path_display.config(text=f"📁 {display_path}")
        
        # Set format
        self.format_var.set(self.prefs.get("format", "mp3_320"))
    
    def validate_inputs(self):
        """Validate inputs"""
        if not self.url_value:
            messagebox.showerror("Error", "Please set a Tidal URL first!")
            return False
            
        if 'tidal.com' not in self.url_value:
            messagebox.showerror("Error", "Please enter a valid Tidal URL!")
            return False
            
        if not self.path_value:
            messagebox.showerror("Error", "Please choose a download folder!")
            return False
            
        if not os.path.exists(self.path_value):
            messagebox.showerror("Error", "Selected folder does not exist!")
            return False
            
        return True
    
    def start_download(self):
        """Start download"""
        if not self.validate_inputs():
            return
        
        self.download_btn.config(state=tk.DISABLED)
        self.cancel_btn.config(state=tk.NORMAL)
        self.cancel_flag = False
        
        self.progress_text.config(text="🚀 Starting download...")
        
        # Save format preference
        self.prefs["format"] = self.format_var.get()
        self.save_preferences()
        
        # Start download thread
        self.download_thread = threading.Thread(target=self.download_worker)
        self.download_thread.daemon = True
        self.download_thread.start()
    
    def cancel_download(self):
        """Cancel download"""
        self.cancel_flag = True
        self.progress_text.config(text="⏹️ Cancelling download...")
    
    def download_worker(self):
        """Download worker"""
        try:
            format_choice = self.format_var.get()
            
            # Determine format settings
            if format_choice == "mp3_320":
                format_type = "flac"
                convert_to_mp3 = True
            else:
                format_type = "flac"
                convert_to_mp3 = False
            
            # Update progress
            self.root.after(0, lambda: self.progress_text.config(text="📋 Preparing download..."))
            
            # Clean URL
            clean_url = self.downloader._clean_tidal_url(self.url_value)
            
            # Start download
            dl_url = f"{self.downloader.base_url}/dl"
            params = {'url': clean_url, 'format': format_type}
            
            response = self.downloader.session.get(dl_url, params=params)
            response.raise_for_status()
            data = response.json()
            
            if not data.get('success') or 'id' not in data:
                self.root.after(0, lambda: self.progress_text.config(text="❌ Failed to start download"))
                return
            
            download_id = data['id']
            self.root.after(0, lambda: self.progress_text.config(text=f"⏳ Download queued (ID: {download_id})"))
            
            # Poll for completion
            for attempt in range(30):
                if self.cancel_flag:
                    self.root.after(0, lambda: self.progress_text.config(text="❌ Download cancelled"))
                    return
                
                time.sleep(2)
                progress_msg = f"⏳ Checking status... ({attempt + 1}/30)"
                self.root.after(0, lambda msg=progress_msg: self.progress_text.config(text=msg))
                
                try:
                    response = self.downloader.session.get(f"{self.downloader.base_url}/dl/{download_id}")
                    response.raise_for_status()
                    data = response.json()
                    
                    status = data.get('status', '')
                    friendly_status = data.get('friendlyStatus', status)
                    
                    if status == 'done':
                        if 'url' in data:
                            self.root.after(0, lambda: self.progress_text.config(text="⬇️ Downloading file..."))
                            zip_path = self.downloader._download_file(data['url'], self.path_value)
                            if zip_path:
                                self.process_download(zip_path, convert_to_mp3)
                                return
                        break
                    elif status == 'error':
                        error_msg = data.get('error', 'Unknown error')
                        self.root.after(0, lambda e=error_msg: self.progress_text.config(text=f"❌ Error: {e}"))
                        return
                    else:
                        self.root.after(0, lambda s=friendly_status: self.progress_text.config(text=f"⏳ {s}"))
                        
                except Exception:
                    continue
            
            # Timeout
            self.root.after(0, lambda: self.progress_text.config(text="⏰ Download timeout - please try again"))
            
        except Exception as e:
            error_msg = f"❌ Error: {str(e)}"
            self.root.after(0, lambda: self.progress_text.config(text=error_msg))
        finally:
            self.root.after(0, lambda: self.download_btn.config(state=tk.NORMAL))
            self.root.after(0, lambda: self.cancel_btn.config(state=tk.DISABLED))
    
    def process_download(self, zip_path, convert_to_mp3):
        """Process the downloaded file"""
        try:
            self.root.after(0, lambda: self.progress_text.config(text="📦 Extracting files..."))
            
            extracted_files = self.downloader._extract_zip(zip_path, self.path_value)
            
            if convert_to_mp3 and extracted_files:
                self.root.after(0, lambda: self.progress_text.config(text="🎵 Converting to DJ-ready MP3 320kbps..."))
                mp3_files = self.downloader._convert_to_mp3(extracted_files, self.path_value)
                self.downloader._cleanup_files(zip_path, extracted_files, mp3_files, self.path_value)
                self.root.after(0, lambda: self.progress_text.config(text="✅ MP3 ready for your DJ set! 🎧"))
            else:
                if os.path.exists(zip_path):
                    os.remove(zip_path)
                self.root.after(0, lambda: self.progress_text.config(text="✅ FLAC download completed! 💎"))
                
        except Exception as e:
            self.root.after(0, lambda: self.progress_text.config(text=f"❌ Processing error: {str(e)}"))

def main():
    root = tk.Tk()
    app = SimpleTidalGUI(root)
    root.mainloop()

if __name__ == "__main__":
    main()