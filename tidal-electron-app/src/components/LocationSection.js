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
        <button 
          className="browse-btn"
          onClick={handleBrowseFolder}
          disabled={disabled}
        >
          📂 Browse
        </button>
      </div>
    </div>
  );
}

export default LocationSection;