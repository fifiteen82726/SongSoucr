import React from 'react';

function URLSection({ url, setUrl, disabled, loading }) {
  return (
    <div className="section">
      <div className="section-title">
        🔗 MUSIC URL
      </div>
      <div className="url-help">
        Supports: Tidal • Amazon Music
      </div>
      <textarea
        className={`url-input ${loading ? 'loading' : ''}`}
        placeholder={loading ? "Fetching song information..." : "Paste your Tidal or Amazon Music track URL here..."}
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        disabled={disabled}
        rows={3}
        style={{ 
          resize: 'vertical',
          fontFamily: 'Monaco, monospace',
          fontSize: '0.9rem'
        }}
      />
    </div>
  );
}

export default URLSection;