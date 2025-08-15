import React from 'react';

function URLSection({ url, setUrl, disabled, loading }) {
  return (
    <div className="section">
      <div className="section-title">
        🔗 TIDAL URL
      </div>
      <textarea
        className={`url-input ${loading ? 'loading' : ''}`}
        placeholder={loading ? "Fetching song information..." : "Paste your Tidal track URL here..."}
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