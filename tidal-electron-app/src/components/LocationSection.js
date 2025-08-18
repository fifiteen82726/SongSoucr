import React from 'react';

function LocationSection({ downloadPath, setDownloadPath, disabled }) {
  const handleBrowseFolder = async () => {
    if (window.electronAPI) {
      try {
        const selectedPath = await window.electronAPI.selectFolder();
        if (selectedPath) {
          setDownloadPath(selectedPath);
        }
      } catch (error) {
        console.error('Error selecting folder:', error);
      }
    }
  };

  const handleOpenFolder = async () => {
    if (window.electronAPI && downloadPath) {
      try {
        const result = await window.electronAPI.openFolder(downloadPath);
        if (!result.success) {
          console.error('Failed to open folder:', result.error);
        }
      } catch (error) {
        console.error('Error opening folder:', error);
      }
    }
  };

  const displayPath = downloadPath 
    ? (downloadPath.length > 50 ? `...${downloadPath.slice(-47)}` : downloadPath)
    : 'No folder selected - click Browse to choose';

  return (
    <div className="section">
      <div className="section-title">
        📁 DOWNLOAD LOCATION
      </div>
      <div className="path-section">
        <div className="path-input">
          <div className="path-display">
            {displayPath}
          </div>
        </div>
        <div className="path-buttons">
          <button 
            className="browse-btn"
            onClick={handleBrowseFolder}
            disabled={disabled}
          >
            📂 Browse
          </button>
          {downloadPath && (
            <button 
              className="open-folder-btn"
              onClick={handleOpenFolder}
              disabled={disabled}
              title="Open download folder"
            >
              📁 Open
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default LocationSection;