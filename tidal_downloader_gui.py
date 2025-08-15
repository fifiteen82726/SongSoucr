#!/usr/bin/env python3

import tkinter as tk
from tkinter import ttk, filedialog, messagebox
import json
import os
import threading
import time
from pathlib import Path
from tidal_downloader import TidalDownloader

class TidalDownloaderGUI:
    def __init__(self, root):
        self.root = root
        self.root.title("Tidal Downloader")
        self.root.geometry("600x500")
        
        # Force light theme
        self.root.configure(bg='white')
        
        # Configure for better macOS appearance
        try:
            # Try to use native macOS appearance
            self.root.tk.call('tk', 'scaling', 1.0)
        except:
            pass
        
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
        # Set background color to white
        self.root.configure(bg='white')
        
        # Main frame with white background
        main_frame = tk.Frame(self.root, bg='white', padx=30, pady=30)
        main_frame.pack(fill=tk.BOTH, expand=True)
        
        # Title
        title_label = tk.Label(main_frame, text="🎵 Tidal Downloader", 
                              font=("SF Pro Display", 20, "bold") if hasattr(tk.font, 'families') else ("Helvetica", 20, "bold"),
                              bg='white', fg='#1d1d1f')
        title_label.pack(pady=(0, 30))
        
        # URL input section
        url_frame = tk.Frame(main_frame, bg='white')
        url_frame.pack(fill=tk.X, pady=(0, 20))
        
        url_label = tk.Label(url_frame, text="Tidal URL:", 
                            font=("Helvetica", 14, "bold"), bg='white', fg='#1d1d1f')
        url_label.pack(anchor=tk.W, pady=(0, 8))
        
        self.url_var = tk.StringVar()
        self.url_entry = tk.Entry(url_frame, textvariable=self.url_var, 
                                 font=("Helvetica", 12), width=60,
                                 bg='#f5f5f7', fg='#1d1d1f', 
                                 relief=tk.FLAT, bd=8)
        self.url_entry.pack(fill=tk.X, ipady=8)
        
        # Format selection
        format_frame = tk.Frame(main_frame, bg='white')
        format_frame.pack(fill=tk.X, pady=(0, 20))
        
        format_label = tk.Label(format_frame, text="Format:", 
                               font=("Helvetica", 14, "bold"), bg='white', fg='#1d1d1f')
        format_label.pack(anchor=tk.W, pady=(0, 8))
        
        self.format_var = tk.StringVar()
        radio_frame = tk.Frame(format_frame, bg='white')
        radio_frame.pack(anchor=tk.W, pady=(5, 0))
        
        self.mp3_radio = tk.Radiobutton(radio_frame, text="MP3 320kbps", 
                                       variable=self.format_var, value="mp3_320",
                                       font=("Helvetica", 12), bg='white', fg='#1d1d1f',
                                       selectcolor='#007AFF', activebackground='white')
        self.mp3_radio.pack(side=tk.LEFT, padx=(0, 40))
        
        self.flac_radio = tk.Radiobutton(radio_frame, text="FLAC Lossless", 
                                        variable=self.format_var, value="flac",
                                        font=("Helvetica", 12), bg='white', fg='#1d1d1f',
                                        selectcolor='#007AFF', activebackground='white')
        self.flac_radio.pack(side=tk.LEFT)
        
        # Download location
        path_frame = tk.Frame(main_frame, bg='white')
        path_frame.pack(fill=tk.X, pady=(0, 20))
        
        path_label = tk.Label(path_frame, text="Download to:", 
                             font=("Helvetica", 14, "bold"), bg='white', fg='#1d1d1f')
        path_label.pack(anchor=tk.W, pady=(0, 8))
        
        path_input_frame = tk.Frame(path_frame, bg='white')
        path_input_frame.pack(fill=tk.X, pady=(5, 0))
        
        self.path_var = tk.StringVar()
        self.path_entry = tk.Entry(path_input_frame, textvariable=self.path_var, 
                                  font=("Helvetica", 12),
                                  bg='#f5f5f7', fg='#1d1d1f',
                                  relief=tk.FLAT, bd=8)
        self.path_entry.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(0, 12), ipady=8)
        
        self.browse_button = tk.Button(path_input_frame, text="Browse", 
                                      command=self.browse_folder, font=("Helvetica", 12),
                                      bg='#e5e5e7', fg='#1d1d1f', relief=tk.FLAT,
                                      padx=16, pady=8)
        self.browse_button.pack(side=tk.RIGHT)
        
        # Progress section
        progress_frame = tk.Frame(main_frame, bg='#f0f0f0')
        progress_frame.pack(fill=tk.X, pady=(20, 15))
        
        progress_label = tk.Label(progress_frame, text="Progress:", 
                                 font=("Helvetica", 12), bg='#f0f0f0', fg='#333333')
        progress_label.pack(anchor=tk.W)
        
        # Create a simple progress bar using Canvas
        self.progress_canvas = tk.Canvas(progress_frame, height=20, bg='white', 
                                        highlightthickness=1, highlightbackground='#cccccc')
        self.progress_canvas.pack(fill=tk.X, pady=(5, 0))
        
        self.progress_var = tk.DoubleVar()
        self.progress_var.set(0)
        
        # Status label
        self.status_var = tk.StringVar()
        self.status_var.set("Ready to download")
        self.status_label = tk.Label(main_frame, textvariable=self.status_var,
                                    font=("Helvetica", 11), bg='#f0f0f0', fg='#666666')
        self.status_label.pack(pady=(5, 20))
        
        # Button frame
        button_frame = tk.Frame(main_frame, bg='#f0f0f0')
        button_frame.pack()
        
        self.download_button = tk.Button(button_frame, text="🎵 Download", 
                                        command=self.start_download, 
                                        font=("Helvetica", 12, "bold"),
                                        bg='#007AFF', fg='white', padx=20, pady=8)
        self.download_button.pack(side=tk.LEFT, padx=(0, 10))
        
        self.cancel_button = tk.Button(button_frame, text="Cancel", 
                                      command=self.cancel_download, 
                                      font=("Helvetica", 12), state=tk.DISABLED,
                                      padx=20, pady=8)
        self.cancel_button.pack(side=tk.LEFT)
        
        # Bind events
        self.url_var.trace('w', self.on_url_change)
        self.format_var.trace('w', self.on_format_change)
        self.path_var.trace('w', self.on_path_change)
        
        # Download thread
        self.download_thread = None
        self.cancel_flag = False
        
        # Bind progress variable to update canvas
        self.progress_var.trace('w', self.update_progress_bar)
        
    def update_progress_bar(self, *args):
        """Update the custom progress bar canvas"""
        try:
            progress = self.progress_var.get()
            canvas_width = self.progress_canvas.winfo_width()
            if canvas_width <= 1:  # Canvas not initialized yet
                self.root.after(100, self.update_progress_bar)
                return
                
            # Clear canvas
            self.progress_canvas.delete("all")
            
            # Draw progress bar
            fill_width = int((progress / 100.0) * canvas_width)
            if fill_width > 0:
                self.progress_canvas.create_rectangle(0, 0, fill_width, 20, 
                                                    fill='#007AFF', outline='')
            
            # Draw progress text
            self.progress_canvas.create_text(canvas_width/2, 10, 
                                           text=f"{progress:.0f}%",
                                           font=("Helvetica", 10))
        except Exception:
            pass
        
    def apply_preferences(self):
        """Apply saved preferences to GUI"""
        self.url_var.set(self.prefs.get("last_url", ""))
        self.path_var.set(self.prefs.get("download_path", ""))
        self.format_var.set(self.prefs.get("format", "mp3_320"))
        
    def browse_folder(self):
        """Open folder selection dialog"""
        folder = filedialog.askdirectory(initialdir=self.path_var.get())
        if folder:
            self.path_var.set(folder)
            
    def on_url_change(self, *args):
        """Handle URL input change"""
        self.prefs["last_url"] = self.url_var.get()
        self.save_preferences()
        
    def on_format_change(self, *args):
        """Handle format selection change"""
        self.prefs["format"] = self.format_var.get()
        self.save_preferences()
        
    def on_path_change(self, *args):
        """Handle download path change"""
        self.prefs["download_path"] = self.path_var.get()
        self.save_preferences()
        
    def validate_inputs(self):
        """Validate user inputs"""
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
        """Start the download process"""
        if not self.validate_inputs():
            return
            
        # Disable download button, enable cancel
        self.download_button.config(state=tk.DISABLED)
        self.cancel_button.config(state=tk.NORMAL)
        self.cancel_flag = False
        
        # Reset progress
        self.progress_var.set(0)
        self.status_var.set("Starting download...")
        
        # Start download in separate thread
        self.download_thread = threading.Thread(target=self.download_worker)
        self.download_thread.daemon = True
        self.download_thread.start()
        
    def cancel_download(self):
        """Cancel the current download"""
        self.cancel_flag = True
        self.status_var.set("Cancelling...")
        
    def download_worker(self):
        """Worker function for download thread"""
        try:
            url = self.url_var.get().strip()
            download_path = self.path_var.get().strip()
            format_choice = self.format_var.get()
            
            # Determine format and conversion settings
            if format_choice == "mp3_320":
                format_type = "flac"  # Download FLAC for best quality, convert to MP3
                convert_to_mp3 = True
            else:
                format_type = "flac"
                convert_to_mp3 = False
                
            # Custom downloader with progress tracking
            success = self.download_with_progress(url, format_type, download_path, convert_to_mp3)
            
            if self.cancel_flag:
                self.root.after(0, lambda: self.status_var.set("Download cancelled"))
            elif success:
                self.root.after(0, lambda: self.status_var.set("Download completed successfully!"))
                self.root.after(0, lambda: self.progress_var.set(100))
            else:
                self.root.after(0, lambda: self.status_var.set("Download failed"))
                
        except Exception as e:
            error_msg = f"Error: {str(e)}"
            self.root.after(0, lambda: self.status_var.set(error_msg))
            
        finally:
            # Re-enable download button, disable cancel
            self.root.after(0, lambda: self.download_button.config(state=tk.NORMAL))
            self.root.after(0, lambda: self.cancel_button.config(state=tk.DISABLED))
            
    def download_with_progress(self, tidal_url, format_type, output_dir, convert_to_mp3):
        """Download with progress updates"""
        # Clean URL
        clean_url = self.downloader._clean_tidal_url(tidal_url)
        
        # Update status
        self.root.after(0, lambda: self.status_var.set(f"Starting download..."))
        self.root.after(0, lambda: self.progress_var.set(10))
        
        if self.cancel_flag:
            return False
            
        # Initiate download
        dl_url = f"{self.downloader.base_url}/dl"
        params = {'url': clean_url, 'format': format_type}
        
        try:
            response = self.downloader.session.get(dl_url, params=params)
            response.raise_for_status()
            data = response.json()
            
            if not data.get('success') or 'id' not in data:
                self.root.after(0, lambda: self.status_var.set(f"Failed to initiate download"))
                return False
                
            download_id = data['id']
            self.root.after(0, lambda: self.status_var.set(f"Download initiated (ID: {download_id})"))
            self.root.after(0, lambda: self.progress_var.set(20))
            
            # Poll for completion with progress updates
            zip_path = self.poll_with_progress(download_id, output_dir)
            if not zip_path or self.cancel_flag:
                return False
                
            # Extract and convert
            self.root.after(0, lambda: self.status_var.set("Processing download..."))
            self.root.after(0, lambda: self.progress_var.set(80))
            
            extracted_files = self.downloader._extract_zip(zip_path, output_dir)
            if convert_to_mp3 and extracted_files:
                self.root.after(0, lambda: self.status_var.set("Converting to MP3..."))
                self.root.after(0, lambda: self.progress_var.set(90))
                mp3_files = self.downloader._convert_to_mp3(extracted_files, output_dir)
                self.downloader._cleanup_files(zip_path, extracted_files, mp3_files, output_dir)
            elif not convert_to_mp3:
                # Just remove ZIP file
                if os.path.exists(zip_path):
                    os.remove(zip_path)
                    
            return True
            
        except Exception as e:
            self.root.after(0, lambda: self.status_var.set(f"Error: {str(e)}"))
            return False
            
    def poll_with_progress(self, download_id, output_dir, max_attempts=30):
        """Poll for completion with progress updates"""
        for attempt in range(max_attempts):
            if self.cancel_flag:
                return None
                
            time.sleep(2)
            progress = 20 + (attempt / max_attempts) * 50  # 20-70% during polling
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
    app = TidalDownloaderGUI(root)
    root.mainloop()

if __name__ == "__main__":
    main()