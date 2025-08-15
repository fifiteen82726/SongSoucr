import React from 'react';

function ProgressSection({ progress, status }) {
  return (
    <div className="section progress-section">
      <div className="section-title" style={{ color: 'white' }}>
        ⏳ DOWNLOAD PROGRESS
      </div>
      <div className="progress-bar">
        <div 
          className="progress-fill" 
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="status-text">
        {status}
      </div>
      {progress > 0 && (
        <div style={{ marginTop: '0.5rem', opacity: 0.8 }}>
          {progress.toFixed(0)}% complete
        </div>
      )}
    </div>
  );
}

export default ProgressSection;