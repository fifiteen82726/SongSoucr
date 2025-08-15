#!/usr/bin/env python3

import tkinter as tk
from tkinter import filedialog, messagebox
import json
import os
import threading
import time
from pathlib import Path
from tidal_downloader import TidalDownloader

class TidalDownloaderFinalGUI:
    def __init__(self, root):
        self.root = root
        self.root.title("Tidal Downloader")
        self.root.geometry("700x600")
        
        # Force light colors for everything
        self.bg_color = '#ffffff'
        self.text_color = '#000000'
        self.input_bg = '#f0f0f0'
        self.button_bg = '#e0e0e0'
        
        # Set root background
        self.root.configure(bg=self.bg_color)
        
        # Try to override macOS appearance
        try:
            self.root.call('tk', 'appname', 'TidalDownloader')
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
        """Create the GUI widgets with explicit colors"""
        
        # Scrollable main frame
        canvas = tk.Canvas(self.root, bg=self.bg_color, highlightthickness=0)
        scrollbar = tk.Scrollbar(self.root, orient="vertical", command=canvas.yview)
        scrollable_frame = tk.Frame(canvas, bg=self.bg_color)
        
        scrollable_frame.bind(
            "<Configure>",
            lambda e: canvas.configure(scrollregion=canvas.bbox("all"))
        )
        
        canvas.create_window((0, 0), window=scrollable_frame, anchor="nw")
        canvas.configure(yscrollcommand=scrollbar.set)
        
        canvas.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")
        
        # Main container with padding
        container = tk.Frame(scrollable_frame, bg=self.bg_color)
        container.pack(fill=tk.BOTH, expand=True, padx=50, pady=40)
        
        # TITLE
        title_frame = tk.Frame(container, bg=self.bg_color)
        title_frame.pack(fill=tk.X, pady=(0, 40))
        
        title_label = tk.Label(title_frame, 
                              text="🎵 Tidal Downloader",
                              font=("Arial", 24, "bold"),
                              bg=self.bg_color,
                              fg=self.text_color)
        title_label.pack()
        
        # URL INPUT SECTION
        url_frame = tk.Frame(container, bg=self.bg_color, relief=tk.RAISED, bd=2)
        url_frame.pack(fill=tk.X, pady=(0, 30))
        
        # URL Header
        url_header = tk.Frame(url_frame, bg='#f8f8f8')
        url_header.pack(fill=tk.X, padx=2, pady=2)
        
        tk.Label(url_header,
                text="🔗 TIDAL URL",
                font=("Arial", 16, "bold"),
                bg='#f8f8f8',
                fg='#333333').pack(pady=10)
        
        # URL Input
        url_input_frame = tk.Frame(url_frame, bg='#f8f8f8')
        url_input_frame.pack(fill=tk.X, padx=15, pady=(0, 15))
        
        self.url_var = tk.StringVar()
        self.url_entry = tk.Text(url_input_frame,
                               height=2,
                               font=("Monaco", 12),
                               bg='#ffffff',
                               fg='#000000',
                               relief=tk.SOLID,
                               bd=2,
                               wrap=tk.WORD,
                               insertbackground='#000000')  # Cursor color
        self.url_entry.pack(fill=tk.X, padx=5, pady=5)
        
        # FORMAT SELECTION SECTION
        format_frame = tk.Frame(container, bg=self.bg_color, relief=tk.RAISED, bd=2)
        format_frame.pack(fill=tk.X, pady=(0, 30))
        
        # Format Header
        format_header = tk.Frame(format_frame, bg='#f0f8ff')
        format_header.pack(fill=tk.X, padx=2, pady=2)
        
        tk.Label(format_header,
                text="🎧 AUDIO FORMAT",
                font=("Arial", 16, "bold"),
                bg='#f0f8ff',
                fg='#333333').pack(pady=10)
        
        # Format Options
        format_options = tk.Frame(format_frame, bg='#f0f8ff')
        format_options.pack(fill=tk.X, padx=20, pady=(0, 15))
        
        self.format_var = tk.StringVar(value="mp3_320")
        
        mp3_frame = tk.Frame(format_options, bg='#ffffff', relief=tk.SOLID, bd=1)
        mp3_frame.pack(fill=tk.X, pady=(0, 10))
        
        self.mp3_radio = tk.Radiobutton(mp3_frame,
                                      text="🎵 MP3 320kbps - Perfect for DJ mixing",
                                      variable=self.format_var,
                                      value="mp3_320",
                                      font=("Arial", 13, "bold"),
                                      bg='#ffffff',
                                      fg='#007AFF',
                                      selectcolor='#ffffff',
                                      activebackground='#ffffff',
                                      activeforeground='#007AFF')
        self.mp3_radio.pack(anchor=tk.W, padx=15, pady=12)
        
        flac_frame = tk.Frame(format_options, bg='#ffffff', relief=tk.SOLID, bd=1)
        flac_frame.pack(fill=tk.X)
        
        self.flac_radio = tk.Radiobutton(flac_frame,
                                       text="💎 FLAC Lossless - Highest quality",
                                       variable=self.format_var,
                                       value="flac",
                                       font=("Arial", 13),
                                       bg='#ffffff',
                                       fg='#333333',
                                       selectcolor='#ffffff',
                                       activebackground='#ffffff',
                                       activeforeground='#333333')
        self.flac_radio.pack(anchor=tk.W, padx=15, pady=12)
        
        # DOWNLOAD LOCATION SECTION
        location_frame = tk.Frame(container, bg=self.bg_color, relief=tk.RAISED, bd=2)
        location_frame.pack(fill=tk.X, pady=(0, 30))
        
        # Location Header
        location_header = tk.Frame(location_frame, bg='#f0fff0')
        location_header.pack(fill=tk.X, padx=2, pady=2)
        
        tk.Label(location_header,
                text="📁 DOWNLOAD LOCATION",
                font=("Arial", 16, "bold"),
                bg='#f0fff0',
                fg='#333333').pack(pady=10)
        
        # Location Input
        location_input = tk.Frame(location_frame, bg='#f0fff0')
        location_input.pack(fill=tk.X, padx=15, pady=(0, 15))
        
        self.path_var = tk.StringVar()
        self.path_entry = tk.Entry(location_input,
                                 textvariable=self.path_var,
                                 font=("Monaco", 11),
                                 bg='#ffffff',
                                 fg='#000000',
                                 relief=tk.SOLID,
                                 bd=2,
                                 insertbackground='#000000')
        self.path_entry.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(5, 10), ipady=8)
        
        browse_btn = tk.Button(location_input,
                             text="📂 Browse",
                             command=self.browse_folder,
                             font=("Arial", 11, "bold"),
                             bg='#34C759',
                             fg='#ffffff',
                             relief=tk.SOLID,
                             bd=0,
                             padx=15,
                             pady=8,
                             cursor='hand2')
        browse_btn.pack(side=tk.RIGHT, padx=5)
        
        # PROGRESS SECTION
        progress_frame = tk.Frame(container, bg=self.bg_color, relief=tk.RAISED, bd=2)
        progress_frame.pack(fill=tk.X, pady=(0, 30))
        
        # Progress Header
        progress_header = tk.Frame(progress_frame, bg='#fff8f0')
        progress_header.pack(fill=tk.X, padx=2, pady=2)
        
        tk.Label(progress_header,
                text="⏳ DOWNLOAD PROGRESS",
                font=("Arial", 16, "bold"),
                bg='#fff8f0',
                fg='#333333').pack(pady=10)
        
        # Progress Content
        progress_content = tk.Frame(progress_frame, bg='#fff8f0')
        progress_content.pack(fill=tk.X, padx=15, pady=(0, 15))
        
        # Progress Bar
        progress_bar_frame = tk.Frame(progress_content, bg='#ffffff', relief=tk.SOLID, bd=2)
        progress_bar_frame.pack(fill=tk.X, pady=(0, 10))
        
        self.progress_canvas = tk.Canvas(progress_bar_frame,
                                       height=30,
                                       bg='#ffffff',
                                       highlightthickness=0)
        self.progress_canvas.pack(fill=tk.X, padx=2, pady=2)
        
        self.progress_var = tk.DoubleVar()
        self.progress_var.trace('w', self.update_progress)
        
        # Status
        self.status_var = tk.StringVar(value="Ready to download your music! 🎵")
        status_label = tk.Label(progress_content,
                              textvariable=self.status_var,
                              font=("Arial", 12),
                              bg='#fff8f0',
                              fg='#666666',
                              wraplength=500)
        status_label.pack()
        
        # BUTTONS SECTION
        button_frame = tk.Frame(container, bg=self.bg_color)
        button_frame.pack(pady=20)
        
        self.download_btn = tk.Button(button_frame,
                                    text="🚀 START DOWNLOAD",
                                    command=self.start_download,
                                    font=("Arial", 16, "bold"),
                                    bg='#007AFF',
                                    fg='#ffffff',
                                    relief=tk.SOLID,
                                    bd=0,
                                    padx=40,
                                    pady=15,
                                    cursor='hand2')
        self.download_btn.pack(side=tk.LEFT, padx=(0, 20))
        
        self.cancel_btn = tk.Button(button_frame,
                                  text="❌ CANCEL",
                                  command=self.cancel_download,
                                  font=("Arial", 16, "bold"),
                                  bg='#FF3B30',
                                  fg='#ffffff',
                                  relief=tk.SOLID,
                                  bd=0,
                                  padx=40,
                                  pady=15,
                                  cursor='hand2',
                                  state=tk.DISABLED)
        self.cancel_btn.pack(side=tk.LEFT)
        
        # Bind events
        self.format_var.trace('w', self.on_format_change)
        self.path_var.trace('w', self.on_path_change)
        
        # Download state
        self.download_thread = None
        self.cancel_flag = False
        
    def get_url_text(self):
        """Get URL from text widget"""
        return self.url_entry.get("1.0", tk.END).strip()
        
    def set_url_text(self, text):
        """Set URL in text widget"""
        self.url_entry.delete("1.0", tk.END)
        self.url_entry.insert("1.0", text)
        
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
            
            # Background
            self.progress_canvas.create_rectangle(0, 0, canvas_width, 30,
                                                fill='#f0f0f0', outline='#d0d0d0')
            
            # Progress fill
            fill_width = int((progress / 100.0) * canvas_width)
            if fill_width > 0:
                self.progress_canvas.create_rectangle(0, 0, fill_width, 30,
                                                    fill='#007AFF', outline='')
            
            # Progress text
            self.progress_canvas.create_text(canvas_width/2, 15,
                                           text=f"{progress:.0f}%",
                                           font=("Arial", 12, "bold"),
                                           fill='#000000')
        except Exception:
            pass
    
    def apply_preferences(self):
        """Apply saved preferences"""
        self.set_url_text(self.prefs.get("last_url", ""))
        self.path_var.set(self.prefs.get("download_path", ""))
        self.format_var.set(self.prefs.get("format", "mp3_320"))
        
    def browse_folder(self):
        """Browse for download folder"""
        folder = filedialog.askdirectory(initialdir=self.path_var.get())
        if folder:
            self.path_var.set(folder)
            
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
        url = self.get_url_text()
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
            
        # Save URL to preferences
        self.prefs["last_url"] = self.get_url_text()
        self.save_preferences()
            
        self.download_btn.config(state=tk.DISABLED)
        self.cancel_btn.config(state=tk.NORMAL)
        self.cancel_flag = False
        
        self.progress_var.set(0)
        self.status_var.set("🚀 Starting download...")
        
        self.download_thread = threading.Thread(target=self.download_worker)
        self.download_thread.daemon = True
        self.download_thread.start()
        
    def cancel_download(self):
        """Cancel download"""
        self.cancel_flag = True
        self.status_var.set("⏹️ Cancelling download...")
        
    def download_worker(self):
        """Download worker thread"""
        try:
            url = self.get_url_text()
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
                self.root.after(0, lambda: self.status_var.set("❌ Download cancelled"))
            elif success:
                self.root.after(0, lambda: self.status_var.set("✅ Download completed successfully! Ready for your DJ set! 🎧"))
                self.root.after(0, lambda: self.progress_var.set(100))
            else:
                self.root.after(0, lambda: self.status_var.set("❌ Download failed - please try again"))
                
        except Exception as e:
            error_msg = f"❌ Error: {str(e)}"
            self.root.after(0, lambda: self.status_var.set(error_msg))
            
        finally:
            self.root.after(0, lambda: self.download_btn.config(state=tk.NORMAL))
            self.root.after(0, lambda: self.cancel_btn.config(state=tk.DISABLED))
            
    def download_with_progress(self, tidal_url, format_type, output_dir, convert_to_mp3):
        """Download with progress updates"""
        clean_url = self.downloader._clean_tidal_url(tidal_url)
        
        self.root.after(0, lambda: self.status_var.set("📋 Preparing download request..."))
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
                self.root.after(0, lambda: self.status_var.set("❌ Failed to start download"))
                return False
                
            download_id = data['id']
            self.root.after(0, lambda: self.status_var.set(f"⏳ Download queued (ID: {download_id})"))
            self.root.after(0, lambda: self.progress_var.set(20))
            
            # Poll for completion
            zip_path = self.poll_with_progress(download_id, output_dir)
            if not zip_path or self.cancel_flag:
                return False
                
            # Process download
            self.root.after(0, lambda: self.status_var.set("📦 Extracting files..."))
            self.root.after(0, lambda: self.progress_var.set(80))
            
            extracted_files = self.downloader._extract_zip(zip_path, output_dir)
            if convert_to_mp3 and extracted_files:
                self.root.after(0, lambda: self.status_var.set("🎵 Converting to DJ-ready MP3 320kbps..."))
                self.root.after(0, lambda: self.progress_var.set(90))
                mp3_files = self.downloader._convert_to_mp3(extracted_files, output_dir)
                self.downloader._cleanup_files(zip_path, extracted_files, mp3_files, output_dir)
            elif not convert_to_mp3:
                if os.path.exists(zip_path):
                    os.remove(zip_path)
                    
            return True
            
        except Exception as e:
            self.root.after(0, lambda: self.status_var.set(f"❌ Error: {str(e)}"))
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
                self.root.after(0, lambda s=friendly_status: self.status_var.set(f"⏳ {s}"))
                
                if status == 'done':
                    if 'url' in data:
                        self.root.after(0, lambda: self.status_var.set("⬇️ Downloading your track..."))
                        self.root.after(0, lambda: self.progress_var.set(70))
                        return self.downloader._download_file(data['url'], output_dir)
                    else:
                        return None
                elif status == 'error':
                    error_msg = data.get('error', 'Unknown error')
                    self.root.after(0, lambda e=error_msg: self.status_var.set(f"❌ Error: {e}"))
                    return None
                    
            except Exception:
                continue
                
        self.root.after(0, lambda: self.status_var.set("⏰ Timeout - please try again"))
        return None

def main():
    root = tk.Tk()
    app = TidalDownloaderFinalGUI(root)
    root.mainloop()

if __name__ == "__main__":
    main()