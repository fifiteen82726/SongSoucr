import React from 'react';

function URLSection({ url, setUrl, disabled }) {
  return (
    <div className="section">
      <div className="section-title">
        🔗 TIDAL URL
      </div>
      <textarea
        className="url-input"
        placeholder="Paste your Tidal track URL here..."
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