import React from 'react';

function DownloadMethodSection({ downloadMethod, setDownloadMethod, disabled }) {
  return (
    <div className="section">
      <div className="section-title">
        ⚙️ DOWNLOAD METHOD
      </div>
      <div className="format-options">
        <div
          className={`format-option ${downloadMethod === 'doubledouble' ? 'selected' : ''}`}
          onClick={() => !disabled && setDownloadMethod('doubledouble')}
          style={{ cursor: disabled ? 'not-allowed' : 'pointer' }}
        >
          <div className="format-title">🔄 DoubleDouble</div>
          <div className="format-desc">Automatic download (requires CAPTCHA if challenged)</div>
        </div>
        <div
          className={`format-option ${downloadMethod === 'lucida' ? 'selected' : ''}`}
          onClick={() => !disabled && setDownloadMethod('lucida')}
          style={{ cursor: disabled ? 'not-allowed' : 'pointer' }}
        >
          <div className="format-title">🌐 Lucida.to</div>
          <div className="format-desc">Automatic in-app download via Lucida API</div>
        </div>
      </div>
    </div>
  );
}

export default DownloadMethodSection;
