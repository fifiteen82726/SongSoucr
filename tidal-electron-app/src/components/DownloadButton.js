import React from 'react';

function DownloadButton({ onStartDownload, onCancelDownload, isDownloading }) {
  return (
    <div className="button-section">
      <button
        className="download-btn"
        onClick={onStartDownload}
        disabled={isDownloading}
      >
        🚀 START DOWNLOAD
      </button>
      
      {isDownloading && (
        <button
          className="cancel-btn"
          onClick={onCancelDownload}
        >
          ❌ CANCEL
        </button>
      )}
    </div>
  );
}

export default DownloadButton;