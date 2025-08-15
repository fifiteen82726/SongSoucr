#!/usr/bin/env python3

import tkinter as tk
from tkinter import filedialog, messagebox
import json
import os
import threading
import time
from pathlib import Path
from tidal_downloader import TidalDownloader

class WorkingTidalGUI:
    def __init__(self, root):
        self.root = root
        self.root.title("Tidal Downloader")
        self.root.geometry("900x800")
        
        # Force white background everywhere
        self.root.configure(bg='white')
        
        # Load preferences
        self.preferences_file = Path.home() / ".tidal_downloader_prefs.json"
        self.load_preferences()
        
        # Initialize downloader
        self.downloader = TidalDownloader()
        
        # State variables
        self.url_value = ""
        self.path_value = ""
        self.download_thread = None
        self.cancel_flag = False
        
        # Create GUI
        self.create_gui()
        
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
    
    def create_gui(self):
        """Create the complete GUI"""
        
        # Create scrollable canvas
        canvas = tk.Canvas(self.root, bg='white', highlightthickness=0)
        scrollbar = tk.Scrollbar(self.root, orient="vertical", command=canvas.yview)
        scrollable_frame = tk.Frame(canvas, bg='white')
        
        scrollable_frame.bind(
            "<Configure>",
            lambda e: canvas.configure(scrollregion=canvas.bbox("all"))
        )
        
        canvas.create_window((0, 0), window=scrollable_frame, anchor="nw")
        canvas.configure(yscrollcommand=scrollbar.set)
        
        # Pack canvas and scrollbar
        canvas.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")
        
        # Main container
        main = tk.Frame(scrollable_frame, bg='white', padx=50, pady=40)
        main.pack(fill=tk.BOTH, expand=True)
        
        # TITLE
        title = tk.Label(main, 
                        text="🎵 TIDAL DOWNLOADER",
                        font=('Helvetica', 32, 'bold'),
                        bg='white',
                        fg='#000000')
        title.pack(pady=(0, 50))
        
        # URL SECTION
        url_section = tk.Frame(main, bg='#f8f8f8', relief=tk.SOLID, bd=2, padx=30, pady=30)
        url_section.pack(fill=tk.X, pady=(0, 30))
        
        tk.Label(url_section,
                text="🔗 TIDAL URL",
                font=('Helvetica', 18, 'bold'),
                bg='#f8f8f8',
                fg='#000000').pack(pady=(0, 15))
        
        # URL display and button
        self.url_display = tk.Label(url_section,
                                   text="Click 'Enter URL' to paste your Tidal link",
                                   font=('Monaco', 11),
                                   bg='white',
                                   fg='#666666',
                                   relief=tk.SUNKEN,
                                   bd=2,
                                   padx=20,
                                   pady=15,
                                   wraplength=700,
                                   justify=tk.LEFT,
                                   anchor='w')
        self.url_display.pack(fill=tk.X, pady=(0, 15))
        
        url_btn_frame = tk.Frame(url_section, bg='#f8f8f8')
        url_btn_frame.pack()
        
        tk.Button(url_btn_frame,
                 text="📝 Enter URL",
                 command=self.open_url_dialog,
                 font=('Helvetica', 14, 'bold'),
                 bg='#007AFF',
                 fg='white',
                 padx=25,
                 pady=12,
                 relief=tk.FLAT,
                 cursor='hand2').pack(side=tk.LEFT, padx=(0, 15))
        
        tk.Button(url_btn_frame,
                 text="🗑️ Clear",
                 command=self.clear_url,
                 font=('Helvetica', 14),
                 bg='#FF6B6B',
                 fg='white',
                 padx=25,
                 pady=12,
                 relief=tk.FLAT,
                 cursor='hand2').pack(side=tk.LEFT)
        
        # FORMAT SECTION
        format_section = tk.Frame(main, bg='#e8f4fd', relief=tk.SOLID, bd=2, padx=30, pady=30)
        format_section.pack(fill=tk.X, pady=(0, 30))
        
        tk.Label(format_section,
                text="🎧 AUDIO FORMAT",
                font=('Helvetica', 18, 'bold'),
                bg='#e8f4fd',
                fg='#000000').pack(pady=(0, 20))
        
        self.format_var = tk.StringVar(value="mp3_320")
        
        # Format buttons
        format_buttons = tk.Frame(format_section, bg='#e8f4fd')
        format_buttons.pack()
        
        mp3_btn = tk.Button(format_buttons,
                           text="🎵 MP3 320kbps\n(Perfect for DJ mixing)",
                           command=lambda: self.set_format("mp3_320"),
                           font=('Helvetica', 14, 'bold'),
                           bg='#007AFF',
                           fg='white',
                           padx=30,
                           pady=20,
                           relief=tk.RAISED,
                           cursor='hand2',
                           width=25)
        mp3_btn.pack(pady=(0, 15))
        
        flac_btn = tk.Button(format_buttons,
                            text="💎 FLAC Lossless\n(Highest quality)",
                            command=lambda: self.set_format("flac"),
                            font=('Helvetica', 14),
                            bg='#6C757D',
                            fg='white',
                            padx=30,
                            pady=20,
                            relief=tk.RAISED,
                            cursor='hand2',
                            width=25)
        flac_btn.pack()
        
        # Store format buttons for styling
        self.mp3_btn = mp3_btn
        self.flac_btn = flac_btn
        
        # DOWNLOAD LOCATION SECTION
        location_section = tk.Frame(main, bg='#f0f8f0', relief=tk.SOLID, bd=2, padx=30, pady=30)
        location_section.pack(fill=tk.X, pady=(0, 30))
        
        tk.Label(location_section,
                text="📁 DOWNLOAD LOCATION",
                font=('Helvetica', 18, 'bold'),
                bg='#f0f8f0',
                fg='#000000').pack(pady=(0, 15))
        
        self.path_display = tk.Label(location_section,
                                    text="Click 'Choose Folder' to select download location",
                                    font=('Monaco', 11),
                                    bg='white',
                                    fg='#666666',
                                    relief=tk.SUNKEN,
                                    bd=2,
                                    padx=20,
                                    pady=15,
                                    wraplength=700,
                                    justify=tk.LEFT,
                                    anchor='w')
        self.path_display.pack(fill=tk.X, pady=(0, 15))
        
        tk.Button(location_section,
                 text="📂 Choose Folder",
                 command=self.browse_folder,
                 font=('Helvetica', 14, 'bold'),
                 bg='#28A745',
                 fg='white',
                 padx=25,
                 pady=12,
                 relief=tk.FLAT,
                 cursor='hand2').pack()
        
        # PROGRESS SECTION
        progress_section = tk.Frame(main, bg='#fff8e7', relief=tk.SOLID, bd=2, padx=30, pady=30)
        progress_section.pack(fill=tk.X, pady=(0, 30))
        
        tk.Label(progress_section,
                text="⏳ DOWNLOAD PROGRESS",
                font=('Helvetica', 18, 'bold'),
                bg='#fff8e7',
                fg='#000000').pack(pady=(0, 15))
        
        self.progress_text = tk.Label(progress_section,
                                     text="Ready to download your music! 🎵",
                                     font=('Helvetica', 13),
                                     bg='white',
                                     fg='#333333',
                                     padx=20,
                                     pady=20,
                                     relief=tk.SUNKEN,
                                     bd=2,
                                     wraplength=700,
                                     justify=tk.LEFT)
        self.progress_text.pack(fill=tk.X)
        
        # DOWNLOAD BUTTONS
        button_section = tk.Frame(main, bg='white')
        button_section.pack(pady=40)
        
        self.download_btn = tk.Button(button_section,
                                     text="🚀 START DOWNLOAD",
                                     command=self.start_download,
                                     font=('Helvetica', 20, 'bold'),
                                     bg='#007AFF',
                                     fg='white',
                                     padx=50,
                                     pady=25,
                                     relief=tk.RAISED,
                                     cursor='hand2')
        self.download_btn.pack(side=tk.LEFT, padx=(0, 30))
        
        self.cancel_btn = tk.Button(button_section,
                                   text="❌ CANCEL",
                                   command=self.cancel_download,
                                   font=('Helvetica', 20, 'bold'),
                                   bg='#DC3545',
                                   fg='white',
                                   padx=50,
                                   pady=25,
                                   relief=tk.RAISED,
                                   cursor='hand2',
                                   state=tk.DISABLED)
        self.cancel_btn.pack(side=tk.LEFT)
    
    def open_url_dialog(self):
        """Open URL input dialog with working text field"""
        dialog = tk.Toplevel(self.root)
        dialog.title("Enter Tidal URL")
        dialog.geometry("500x200")
        dialog.configure(bg='white')
        dialog.transient(self.root)
        dialog.grab_set()
        
        # Center the dialog
        dialog.update_idletasks()
        x = (dialog.winfo_screenwidth() // 2) - (500 // 2)
        y = (dialog.winfo_screenheight() // 2) - (200 // 2)
        dialog.geometry(f"500x200+{x}+{y}")
        
        # Dialog content
        tk.Label(dialog,
                text="Paste your Tidal URL here:",
                font=('Helvetica', 14, 'bold'),
                bg='white',
                fg='black').pack(pady=(20, 10))
        
        # Text entry
        url_entry = tk.Text(dialog,
                           height=3,
                           font=('Monaco', 12),
                           bg='#f8f8f8',
                           fg='black',
                           relief=tk.SOLID,
                           bd=2,
                           wrap=tk.WORD)
        url_entry.pack(padx=20, pady=(0, 20), fill=tk.X)
        
        # Pre-fill with existing URL
        if self.url_value:
            url_entry.insert('1.0', self.url_value)
            url_entry.selection_range('1.0', tk.END)
        
        # Focus on text entry
        url_entry.focus_set()
        
        # Button frame
        btn_frame = tk.Frame(dialog, bg='white')
        btn_frame.pack(pady=10)
        
        def save_url():
            url = url_entry.get('1.0', tk.END).strip()
            if url:
                self.url_value = url
                display_url = url if len(url) <= 80 else url[:77] + "..."
                self.url_display.config(text=f"🔗 {display_url}",
                                       fg='#000000')
                self.prefs["last_url"] = url
                self.save_preferences()
            dialog.destroy()
        
        def cancel():
            dialog.destroy()
        
        # Buttons
        tk.Button(btn_frame,
                 text="✅ OK",
                 command=save_url,
                 font=('Helvetica', 12, 'bold'),
                 bg='#007AFF',
                 fg='white',
                 padx=20,
                 pady=8).pack(side=tk.LEFT, padx=(0, 10))
        
        tk.Button(btn_frame,
                 text="❌ Cancel",
                 command=cancel,
                 font=('Helvetica', 12),
                 bg='#6C757D',
                 fg='white',
                 padx=20,
                 pady=8).pack(side=tk.LEFT)
        
        # Bind Enter key to save
        dialog.bind('<Return>', lambda e: save_url())
        
    def clear_url(self):
        """Clear the URL"""
        self.url_value = ""
        self.url_display.config(text="Click 'Enter URL' to paste your Tidal link", fg='#666666')
        self.prefs["last_url"] = ""
        self.save_preferences()
    
    def set_format(self, format_choice):
        """Set format and update button styles"""
        self.format_var.set(format_choice)
        
        if format_choice == "mp3_320":
            self.mp3_btn.config(bg='#007AFF', relief=tk.RAISED)
            self.flac_btn.config(bg='#6C757D', relief=tk.RAISED)
        else:
            self.mp3_btn.config(bg='#6C757D', relief=tk.RAISED)
            self.flac_btn.config(bg='#007AFF', relief=tk.RAISED)
        
        self.prefs["format"] = format_choice
        self.save_preferences()
    
    def browse_folder(self):
        """Browse for folder"""
        initial_dir = self.path_value or str(Path.home() / "Downloads")
        folder = filedialog.askdirectory(initialdir=initial_dir)
        if folder:
            self.path_value = folder
            display_path = folder if len(folder) <= 80 else "..." + folder[-77:]
            self.path_display.config(text=f"📁 {display_path}", fg='#000000')
            self.prefs["download_path"] = folder
            self.save_preferences()
    
    def apply_preferences(self):
        """Apply saved preferences"""
        # Set URL
        if self.prefs.get("last_url"):
            self.url_value = self.prefs["last_url"]
            display_url = self.url_value if len(self.url_value) <= 80 else self.url_value[:77] + "..."
            self.url_display.config(text=f"🔗 {display_url}", fg='#000000')
        
        # Set path
        if self.prefs.get("download_path"):
            self.path_value = self.prefs["download_path"]
            display_path = self.path_value if len(self.path_value) <= 80 else "..." + self.path_value[-77:]
            self.path_display.config(text=f"📁 {display_path}", fg='#000000')
        
        # Set format
        format_choice = self.prefs.get("format", "mp3_320")
        self.set_format(format_choice)
    
    def validate_inputs(self):
        """Validate inputs"""
        if not self.url_value:
            messagebox.showerror("Missing URL", "Please enter a Tidal URL first!")
            return False
            
        if 'tidal.com' not in self.url_value:
            messagebox.showerror("Invalid URL", "Please enter a valid Tidal URL!")
            return False
            
        if not self.path_value:
            messagebox.showerror("Missing Folder", "Please choose a download folder!")
            return False
            
        if not os.path.exists(self.path_value):
            messagebox.showerror("Invalid Folder", "Selected folder does not exist!")
            return False
            
        return True
    
    def start_download(self):
        """Start download"""
        if not self.validate_inputs():
            return
        
        self.download_btn.config(state=tk.DISABLED)
        self.cancel_btn.config(state=tk.NORMAL)
        self.cancel_flag = False
        
        self.progress_text.config(text="🚀 Starting download...", fg='#007AFF')
        
        # Start download thread
        self.download_thread = threading.Thread(target=self.download_worker)
        self.download_thread.daemon = True
        self.download_thread.start()
    
    def cancel_download(self):
        """Cancel download"""
        self.cancel_flag = True
        self.progress_text.config(text="⏹️ Cancelling download...", fg='#FF6B6B')
    
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
            
            # Clean URL
            clean_url = self.downloader._clean_tidal_url(self.url_value)
            
            # Update progress
            self.root.after(0, lambda: self.progress_text.config(text="📋 Preparing download request...", fg='#007AFF'))
            
            # Start download
            dl_url = f"{self.downloader.base_url}/dl"
            params = {'url': clean_url, 'format': format_type}
            
            response = self.downloader.session.get(dl_url, params=params)
            response.raise_for_status()
            data = response.json()
            
            if not data.get('success') or 'id' not in data:
                self.root.after(0, lambda: self.progress_text.config(text="❌ Failed to start download", fg='#DC3545'))
                return
            
            download_id = data['id']
            self.root.after(0, lambda: self.progress_text.config(text=f"⏳ Download queued (ID: {download_id})", fg='#007AFF'))
            
            # Poll for completion
            for attempt in range(30):
                if self.cancel_flag:
                    self.root.after(0, lambda: self.progress_text.config(text="❌ Download cancelled by user", fg='#DC3545'))
                    return
                
                time.sleep(2)
                progress_msg = f"⏳ Checking download status... ({attempt + 1}/30)"
                self.root.after(0, lambda msg=progress_msg: self.progress_text.config(text=msg, fg='#007AFF'))
                
                try:
                    response = self.downloader.session.get(f"{self.downloader.base_url}/dl/{download_id}")
                    response.raise_for_status()
                    data = response.json()
                    
                    status = data.get('status', '')
                    friendly_status = data.get('friendlyStatus', status)
                    
                    if status == 'done':
                        if 'url' in data:
                            self.root.after(0, lambda: self.progress_text.config(text="⬇️ Downloading your track...", fg='#007AFF'))
                            zip_path = self.downloader._download_file(data['url'], self.path_value)
                            if zip_path:
                                self.process_download(zip_path, convert_to_mp3)
                                return
                        break
                    elif status == 'error':
                        error_msg = data.get('error', 'Unknown error')
                        self.root.after(0, lambda e=error_msg: self.progress_text.config(text=f"❌ Download error: {e}", fg='#DC3545'))
                        return
                    else:
                        status_msg = f"⏳ Status: {friendly_status}"
                        self.root.after(0, lambda s=status_msg: self.progress_text.config(text=s, fg='#007AFF'))
                        
                except Exception:
                    continue
            
            # Timeout
            self.root.after(0, lambda: self.progress_text.config(text="⏰ Download timeout - please try again", fg='#DC3545'))
            
        except Exception as e:
            error_msg = f"❌ Error: {str(e)}"
            self.root.after(0, lambda: self.progress_text.config(text=error_msg, fg='#DC3545'))
        finally:
            self.root.after(0, lambda: self.download_btn.config(state=tk.NORMAL))
            self.root.after(0, lambda: self.cancel_btn.config(state=tk.DISABLED))
    
    def process_download(self, zip_path, convert_to_mp3):
        """Process the downloaded file"""
        try:
            self.root.after(0, lambda: self.progress_text.config(text="📦 Extracting files...", fg='#007AFF'))
            
            extracted_files = self.downloader._extract_zip(zip_path, self.path_value)
            
            if convert_to_mp3 and extracted_files:
                self.root.after(0, lambda: self.progress_text.config(text="🎵 Converting to DJ-ready MP3 320kbps...", fg='#007AFF'))
                mp3_files = self.downloader._convert_to_mp3(extracted_files, self.path_value)
                self.downloader._cleanup_files(zip_path, extracted_files, mp3_files, self.path_value)
                self.root.after(0, lambda: self.progress_text.config(text="✅ MP3 ready for your DJ set! Track saved to your folder 🎧", fg='#28A745'))
            else:
                if os.path.exists(zip_path):
                    os.remove(zip_path)
                self.root.after(0, lambda: self.progress_text.config(text="✅ FLAC download completed! Highest quality track ready 💎", fg='#28A745'))
                
        except Exception as e:
            self.root.after(0, lambda: self.progress_text.config(text=f"❌ Processing error: {str(e)}", fg='#DC3545'))

def main():
    root = tk.Tk()
    app = WorkingTidalGUI(root)
    root.mainloop()

if __name__ == "__main__":
    main()