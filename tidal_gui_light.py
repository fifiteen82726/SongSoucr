#!/usr/bin/env python3

import tkinter as tk
from tkinter import filedialog, messagebox
import json
import os
import threading
import time
from pathlib import Path
from tidal_downloader import TidalDownloader

class TidalDownloaderLightGUI:
    def __init__(self, root):
        self.root = root
        self.root.title("Tidal Downloader")
        self.root.geometry("650x550")
        
        # Force light appearance
        self.root.configure(bg='#ffffff')
        
        # Load preferences
        self.preferences_file = Path.home() / ".tidal_downloader_prefs.json"
        self.load_preferences()
        
        # Initialize downloader
        self.downloader = TidalDownloader()
        
        # Create GUI elements
        self.create_widgets()
        
        # Apply saved preferences
        self.apply_preferences()
        
    def load_preferences(self):
        """Load user preferences from file"""
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
            except (json.JSONDecodeError, FileNotFoundError):
                pass
    
    def save_preferences(self):
        """Save user preferences to file"""
        try:
            with open(self.preferences_file, 'w') as f:
                json.dump(self.prefs, f, indent=2)
        except Exception as e:
            print(f"Error saving preferences: {e}")
    
    def create_widgets(self):
        """Create the GUI widgets"""
        # Main container
        container = tk.Frame(self.root, bg='#ffffff', padx=40, pady=30)
        container.pack(fill=tk.BOTH, expand=True)
        
        # Title
        title = tk.Label(container, 
                        text="🎵 Tidal Downloader", 
                        font=("Helvetica", 22, "bold"),
                        bg='#ffffff', 
                        fg='#000000')
        title.pack(pady=(0, 40))
        
        # URL Section
        url_section = tk.Frame(container, bg='#ffffff')
        url_section.pack(fill=tk.X, pady=(0, 25))
        
        tk.Label(url_section, 
                text="Tidal URL:",
                font=("Helvetica", 14, "bold"),
                bg='#ffffff',
                fg='#000000').pack(anchor=tk.W, pady=(0, 8))
        
        self.url_var = tk.StringVar()
        url_entry = tk.Entry(url_section,
                           textvariable=self.url_var,
                           font=("Helvetica", 13),
                           bg='#f8f8f8',
                           fg='#000000',
                           relief=tk.SOLID,
                           bd=1,
                           highlightthickness=0)
        url_entry.pack(fill=tk.X, ipady=12, ipadx=15)
        
        # Format Section
        format_section = tk.Frame(container, bg='#ffffff')
        format_section.pack(fill=tk.X, pady=(0, 25))
        
        tk.Label(format_section,
                text="Audio Format:",
                font=("Helvetica", 14, "bold"),
                bg='#ffffff',
                fg='#000000').pack(anchor=tk.W, pady=(0, 10))
        
        self.format_var = tk.StringVar(value="mp3_320")
        
        format_options = tk.Frame(format_section, bg='#ffffff')
        format_options.pack(anchor=tk.W)
        
        tk.Radiobutton(format_options,
                      text="MP3 320kbps (Recommended for DJing)",
                      variable=self.format_var,
                      value="mp3_320",
                      font=("Helvetica", 12),
                      bg='#ffffff',
                      fg='#000000',
                      selectcolor='#ffffff',
                      activebackground='#ffffff',
                      activeforeground='#000000').pack(anchor=tk.W, pady=(0, 8))
        
        tk.Radiobutton(format_options,
                      text="FLAC Lossless (Original Quality)",
                      variable=self.format_var,
                      value="flac",
                      font=("Helvetica", 12),
                      bg='#ffffff',
                      fg='#000000',
                      selectcolor='#ffffff',
                      activebackground='#ffffff',
                      activeforeground='#000000').pack(anchor=tk.W)
        
        # Download Location Section
        location_section = tk.Frame(container, bg='#ffffff')
        location_section.pack(fill=tk.X, pady=(0, 25))
        
        tk.Label(location_section,
                text="Download Location:",
                font=("Helvetica", 14, "bold"),
                bg='#ffffff',
                fg='#000000').pack(anchor=tk.W, pady=(0, 8))
        
        location_input = tk.Frame(location_section, bg='#ffffff')
        location_input.pack(fill=tk.X)
        
        self.path_var = tk.StringVar()
        path_entry = tk.Entry(location_input,
                            textvariable=self.path_var,
                            font=("Helvetica", 12),
                            bg='#f8f8f8',
                            fg='#000000',
                            relief=tk.SOLID,
                            bd=1,
                            highlightthickness=0)
        path_entry.pack(side=tk.LEFT, fill=tk.X, expand=True, ipady=10, ipadx=12)
        
        browse_btn = tk.Button(location_input,
                              text="Browse",
                              command=self.browse_folder,
                              font=("Helvetica", 12),
                              bg='#e8e8e8',
                              fg='#000000',
                              relief=tk.SOLID,
                              bd=1,
                              padx=20,
                              pady=10,
                              cursor='hand2')
        browse_btn.pack(side=tk.RIGHT, padx=(15, 0))
        
        # Progress Section
        progress_section = tk.Frame(container, bg='#ffffff')
        progress_section.pack(fill=tk.X, pady=(20, 25))
        
        tk.Label(progress_section,
                text="Download Progress:",
                font=("Helvetica", 14, "bold"),
                bg='#ffffff',
                fg='#000000').pack(anchor=tk.W, pady=(0, 8))
        
        # Progress bar frame
        progress_frame = tk.Frame(progress_section, bg='#e0e0e0', relief=tk.SOLID, bd=1)
        progress_frame.pack(fill=tk.X, pady=(0, 8))
        
        self.progress_canvas = tk.Canvas(progress_frame,
                                       height=25,
                                       bg='#e0e0e0',
                                       highlightthickness=0)
        self.progress_canvas.pack(fill=tk.X)
        
        self.progress_var = tk.DoubleVar()
        self.progress_var.trace('w', self.update_progress)
        
        # Status label
        self.status_var = tk.StringVar(value="Ready to download")
        status_label = tk.Label(progress_section,
                              textvariable=self.status_var,
                              font=("Helvetica", 11),
                              bg='#ffffff',
                              fg='#666666')
        status_label.pack(anchor=tk.W)
        
        # Buttons Section
        button_section = tk.Frame(container, bg='#ffffff')
        button_section.pack(pady=(20, 0))
        
        self.download_btn = tk.Button(button_section,
                                    text="🎵 Download Song",
                                    command=self.start_download,
                                    font=("Helvetica", 14, "bold"),
                                    bg='#007AFF',
                                    fg='#ffffff',
                                    relief=tk.SOLID,
                                    bd=0,
                                    padx=30,
                                    pady=12,
                                    cursor='hand2')
        self.download_btn.pack(side=tk.LEFT, padx=(0, 15))
        
        self.cancel_btn = tk.Button(button_section,
                                  text="Cancel",
                                  command=self.cancel_download,
                                  font=("Helvetica", 14),
                                  bg='#ff3b30',
                                  fg='#ffffff',
                                  relief=tk.SOLID,
                                  bd=0,
                                  padx=30,
                                  pady=12,
                                  cursor='hand2',
                                  state=tk.DISABLED)
        self.cancel_btn.pack(side=tk.LEFT)
        
        # Bind events
        self.url_var.trace('w', self.on_url_change)
        self.format_var.trace('w', self.on_format_change)
        self.path_var.trace('w', self.on_path_change)
        
        # Download state
        self.download_thread = None
        self.cancel_flag = False
        
    def update_progress(self, *args):
        """Update progress bar"""
        try:
            progress = self.progress_var.get()
            canvas_width = self.progress_canvas.winfo_width()
            
            if canvas_width <= 1:
                self.root.after(100, self.update_progress)
                return
            
            # Clear canvas
            self.progress_canvas.delete("all")
            
            # Draw progress
            fill_width = int((progress / 100.0) * canvas_width)
            if fill_width > 0:
                self.progress_canvas.create_rectangle(0, 0, fill_width, 25,
                                                    fill='#007AFF', outline='')
            
            # Progress text
            self.progress_canvas.create_text(canvas_width/2, 12,
                                           text=f"{progress:.0f}%",
                                           font=("Helvetica", 10, "bold"),
                                           fill='#000000' if progress < 50 else '#ffffff')
        except Exception:
            pass
    
    def apply_preferences(self):
        """Apply saved preferences"""
        self.url_var.set(self.prefs.get("last_url", ""))
        self.path_var.set(self.prefs.get("download_path", ""))
        self.format_var.set(self.prefs.get("format", "mp3_320"))
        
    def browse_folder(self):
        """Browse for download folder"""
        folder = filedialog.askdirectory(initialdir=self.path_var.get())
        if folder:
            self.path_var.set(folder)
            
    def on_url_change(self, *args):
        """Handle URL change"""
        self.prefs["last_url"] = self.url_var.get()
        self.save_preferences()
        
    def on_format_change(self, *args):
        """Handle format change"""
        self.prefs["format"] = self.format_var.get()
        self.save_preferences()
        
    def on_path_change(self, *args):
        """Handle path change"""
        self.prefs["download_path"] = self.path_var.get()
        self.save_preferences()
        
    def validate_inputs(self):
        """Validate inputs"""
        url = self.url_var.get().strip()
        if not url:
            messagebox.showerror("Error", "Please enter a Tidal URL")
            return False
            
        if 'tidal.com' not in url:
            messagebox.showerror("Error", "Please enter a valid Tidal URL")
            return False
            
        path = self.path_var.get().strip()
        if not path:
            messagebox.showerror("Error", "Please select a download folder")
            return False
            
        if not os.path.exists(path):
            messagebox.showerror("Error", "Selected download folder does not exist")
            return False
            
        return True
        
    def start_download(self):
        """Start download"""
        if not self.validate_inputs():
            return
            
        self.download_btn.config(state=tk.DISABLED)
        self.cancel_btn.config(state=tk.NORMAL)
        self.cancel_flag = False
        
        self.progress_var.set(0)
        self.status_var.set("Starting download...")
        
        self.download_thread = threading.Thread(target=self.download_worker)
        self.download_thread.daemon = True
        self.download_thread.start()
        
    def cancel_download(self):
        """Cancel download"""
        self.cancel_flag = True
        self.status_var.set("Cancelling...")
        
    def download_worker(self):
        """Download worker thread"""
        try:
            url = self.url_var.get().strip()
            download_path = self.path_var.get().strip()
            format_choice = self.format_var.get()
            
            # Format settings
            if format_choice == "mp3_320":
                format_type = "flac"
                convert_to_mp3 = True
            else:
                format_type = "flac"
                convert_to_mp3 = False
                
            # Download
            success = self.download_with_progress(url, format_type, download_path, convert_to_mp3)
            
            if self.cancel_flag:
                self.root.after(0, lambda: self.status_var.set("Download cancelled"))
            elif success:
                self.root.after(0, lambda: self.status_var.set("✅ Download completed successfully!"))
                self.root.after(0, lambda: self.progress_var.set(100))
            else:
                self.root.after(0, lambda: self.status_var.set("❌ Download failed"))
                
        except Exception as e:
            error_msg = f"Error: {str(e)}"
            self.root.after(0, lambda: self.status_var.set(error_msg))
            
        finally:
            self.root.after(0, lambda: self.download_btn.config(state=tk.NORMAL))
            self.root.after(0, lambda: self.cancel_btn.config(state=tk.DISABLED))
            
    def download_with_progress(self, tidal_url, format_type, output_dir, convert_to_mp3):
        """Download with progress updates"""
        clean_url = self.downloader._clean_tidal_url(tidal_url)
        
        self.root.after(0, lambda: self.status_var.set("Initiating download..."))
        self.root.after(0, lambda: self.progress_var.set(10))
        
        if self.cancel_flag:
            return False
            
        dl_url = f"{self.downloader.base_url}/dl"
        params = {'url': clean_url, 'format': format_type}
        
        try:
            response = self.downloader.session.get(dl_url, params=params)
            response.raise_for_status()
            data = response.json()
            
            if not data.get('success') or 'id' not in data:
                self.root.after(0, lambda: self.status_var.set("Failed to initiate download"))
                return False
                
            download_id = data['id']
            self.root.after(0, lambda: self.status_var.set(f"Download queued (ID: {download_id})"))
            self.root.after(0, lambda: self.progress_var.set(20))
            
            # Poll for completion
            zip_path = self.poll_with_progress(download_id, output_dir)
            if not zip_path or self.cancel_flag:
                return False
                
            # Process download
            self.root.after(0, lambda: self.status_var.set("Processing files..."))
            self.root.after(0, lambda: self.progress_var.set(80))
            
            extracted_files = self.downloader._extract_zip(zip_path, output_dir)
            if convert_to_mp3 and extracted_files:
                self.root.after(0, lambda: self.status_var.set("Converting to MP3 320kbps..."))
                self.root.after(0, lambda: self.progress_var.set(90))
                mp3_files = self.downloader._convert_to_mp3(extracted_files, output_dir)
                self.downloader._cleanup_files(zip_path, extracted_files, mp3_files, output_dir)
            elif not convert_to_mp3:
                if os.path.exists(zip_path):
                    os.remove(zip_path)
                    
            return True
            
        except Exception as e:
            self.root.after(0, lambda: self.status_var.set(f"Error: {str(e)}"))
            return False
            
    def poll_with_progress(self, download_id, output_dir, max_attempts=30):
        """Poll with progress"""
        for attempt in range(max_attempts):
            if self.cancel_flag:
                return None
                
            time.sleep(2)
            progress = 20 + (attempt / max_attempts) * 50
            self.root.after(0, lambda p=progress: self.progress_var.set(p))
            
            try:
                response = self.downloader.session.get(f"{self.downloader.base_url}/dl/{download_id}")
                response.raise_for_status()
                data = response.json()
                
                status = data.get('status', '')
                friendly_status = data.get('friendlyStatus', status)
                self.root.after(0, lambda s=friendly_status: self.status_var.set(f"Status: {s}"))
                
                if status == 'done':
                    if 'url' in data:
                        self.root.after(0, lambda: self.status_var.set("Downloading file..."))
                        self.root.after(0, lambda: self.progress_var.set(70))
                        return self.downloader._download_file(data['url'], output_dir)
                    else:
                        return None
                elif status == 'error':
                    error_msg = data.get('error', 'Unknown error')
                    self.root.after(0, lambda e=error_msg: self.status_var.set(f"Error: {e}"))
                    return None
                    
            except Exception:
                continue
                
        self.root.after(0, lambda: self.status_var.set("Timeout waiting for download"))
        return None

def main():
    root = tk.Tk()
    app = TidalDownloaderLightGUI(root)
    root.mainloop()

if __name__ == "__main__":
    main()