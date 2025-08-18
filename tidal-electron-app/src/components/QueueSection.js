import React from 'react';

function QueueSection({ queue, onRetry, onRemove, downloadPath }) {
  console.log('QueueSection received queue:', queue);
  
  const getStatusIcon = (status) => {
    switch (status) {
      case 'queued': return '⏳';
      case 'downloading': return '⬇️';
      case 'completed': return '✅';
      case 'failed': return '❌';
      default: return '📁';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'queued': return '#fbbf24';
      case 'downloading': return '#3b82f6';
      case 'completed': return '#10b981';
      case 'failed': return '#ef4444';
      default: return '#6b7280';
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

  return (
    <div className="section queue-section">
      <div className="queue-header">
        <div className="section-title" style={{ color: 'black' }}>
          📋 DOWNLOAD QUEUE ({queue.length})
        </div>
        {downloadPath && (
          <button 
            className="open-folder-btn"
            onClick={handleOpenFolder}
            title="Open download folder"
          >
            📂 Open Folder
          </button>
        )}
      </div>
      
      {queue.length === 0 ? (
        <div style={{ 
          textAlign: 'center', 
          color: '#9ca3af', 
          padding: '2rem',
          fontStyle: 'italic'
        }}>
          No songs in queue. Add a Tidal URL above to get started!
        </div>
      ) : (
        <div className="queue-list">
          {queue.map((item) => {
            console.log('Rendering queue item:', item);
            return (
            <div key={item.id} className="queue-item">
              <div className="queue-item-header">
                <div className="queue-item-info">
                  <div className="queue-item-title">
                    <span 
                      className="status-icon" 
                      style={{ color: getStatusColor(item.status) }}
                    >
                      {getStatusIcon(item.status)}
                    </span>
                    <strong>{item.title || 'Loading title...'}</strong>
                  </div>
                  <div className="queue-item-artist">
                    by {item.artist || 'Loading artist...'}
                  </div>
                </div>
                
                <div className="queue-item-actions">
                  {item.status === 'failed' && (
                    <button 
                      className="retry-btn"
                      onClick={() => onRetry(item.id)}
                      title="Retry download"
                    >
                      🔄 Retry
                    </button>
                  )}
                  {(item.status === 'queued' || item.status === 'failed') && (
                    <button 
                      className="remove-btn"
                      onClick={() => onRemove(item.id)}
                      title="Remove from queue"
                    >
                      🗑️
                    </button>
                  )}
                </div>
              </div>
              
              {item.status === 'downloading' && (
                <div className="queue-progress">
                  <div className="progress-bar">
                    <div 
                      className="progress-fill" 
                      style={{ width: `${item.progress || 0}%` }}
                    />
                  </div>
                  <div className="progress-text">
                    {(item.progress || 0).toFixed(0)}% complete
                  </div>
                </div>
              )}
              
              {item.status === 'failed' && item.error && (
                <div className="queue-error">
                  Error: {item.error}
                </div>
              )}
              
              <div className="queue-item-meta">
                <span>Format: {item.format === 'flac' ? 'FLAC' : 'MP3 320kbps'}</span>
                <span>Added: {new Date(item.addedAt).toLocaleTimeString()}</span>
              </div>
            </div>
          );
          })}
        </div>
      )}
    </div>
  );
}

export default QueueSection;