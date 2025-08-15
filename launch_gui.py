#!/usr/bin/env python3
"""
Simple launcher for Tidal Downloader GUI
"""

import sys
import subprocess
from pathlib import Path

def main():
    # Get the directory where this script is located
    script_dir = Path(__file__).parent
    gui_script = script_dir / "tidal_downloader_gui.py"
    
    if not gui_script.exists():
        print("Error: GUI script not found")
        sys.exit(1)
        
    # Launch the GUI
    try:
        subprocess.run([sys.executable, str(gui_script)])
    except KeyboardInterrupt:
        print("\nExiting...")
    except Exception as e:
        print(f"Error launching GUI: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()