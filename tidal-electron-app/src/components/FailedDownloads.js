import React from 'react';

const FailedDownloads = ({ failedDownloads, onRetry, onRemove }) => {
  if (failedDownloads.length === 0) {
    return (
      <div className="no-failed-downloads">
        <div className="empty-state">
          <div className="empty-icon">✅</div>
          <h3>No Failed Downloads</h3>
          <p>All your downloads have been successful!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="failed-downloads">
      <div className="failed-header">
        <h3>Failed Downloads ({failedDownloads.length})</h3>
        <p>Retry failed downloads or remove them from the list</p>
      </div>
      
      <div className="failed-list">
        {failedDownloads.map((item, index) => (
          <div key={index} className="failed-item">
            <div className="failed-info">
              <div className="failed-url">
                <span className="url-label">🔗 URL:</span>
                <span className="url-text">{item.url}</span>
              </div>
              <div className="failed-reason">
                <span className="reason-label">❌ Reason:</span>
                <span className="reason-text">{item.reason}</span>
              </div>
              <div className="failed-time">
                <span className="time-label">🕒 Failed at:</span>
                <span className="time-text">{new Date(item.timestamp).toLocaleString()}</span>
              </div>
              {item.format && (
                <div className="failed-format">
                  <span className="format-label">🎵 Format:</span>
                  <span className="format-text">{item.format.toUpperCase()}</span>
                </div>
              )}
            </div>
            
            <div className="failed-actions">
              <button 
                className="retry-btn"
                onClick={() => onRetry(item)}
                title="Retry this download"
              >
                🔄 Retry
              </button>
              <button 
                className="remove-btn"
                onClick={() => onRemove(index)}
                title="Remove from failed list"
              >
                🗑️ Remove
              </button>
            </div>
          </div>
        ))}
      </div>
      
      {failedDownloads.length > 1 && (
        <div className="failed-bulk-actions">
          <button 
            className="retry-all-btn"
            onClick={() => failedDownloads.forEach(onRetry)}
          >
            🔄 Retry All ({failedDownloads.length})
          </button>
          <button 
            className="clear-all-btn"
            onClick={() => {
              if (window.confirm(`Remove all ${failedDownloads.length} failed downloads from the list?`)) {
                failedDownloads.forEach((_, index) => onRemove(index));
              }
            }}
          >
            🗑️ Clear All
          </button>
        </div>
      )}
    </div>
  );
};

export default FailedDownloads;