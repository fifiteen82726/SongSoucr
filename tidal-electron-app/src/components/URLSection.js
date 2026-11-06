import React from 'react';

function URLSection({ url, setUrl, disabled, loading }) {
  return (
    <div className="section">
      <div className="section-title">
        🔗 MUSIC URL
      </div>
      <div className="url-help">
        Supports: Tidal • Amazon Music — tracks and playlists
      </div>
      <div className="url-help">
        Amazon playlists open in your signed-in browser. Keep Tidal Quick Queue enabled.
      </div>
      <textarea
        className={`url-input ${loading ? 'loading' : ''}`}
        placeholder={loading ? "Fetching track or playlist information..." : "Paste your Tidal or Amazon Music track or playlist URL here..."}
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
