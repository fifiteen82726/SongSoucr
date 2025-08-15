import React from 'react';

function FormatSection({ format, setFormat, disabled }) {
  return (
    <div className="section">
      <div className="section-title">
        🎧 AUDIO FORMAT
      </div>
      <div className="format-options">
        <div 
          className={`format-option ${format === 'mp3_320' ? 'selected' : ''}`}
          onClick={() => !disabled && setFormat('mp3_320')}
          style={{ cursor: disabled ? 'not-allowed' : 'pointer' }}
        >
          <div className="format-title">🎵 MP3 320kbps</div>
          <div className="format-desc">Perfect for DJ mixing</div>
        </div>
        <div 
          className={`format-option ${format === 'flac' ? 'selected' : ''}`}
          onClick={() => !disabled && setFormat('flac')}
          style={{ cursor: disabled ? 'not-allowed' : 'pointer' }}
        >
          <div className="format-title">💎 FLAC Lossless</div>
          <div className="format-desc">Highest quality</div>
        </div>
      </div>
    </div>
  );
}

export default FormatSection;