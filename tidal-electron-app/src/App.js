import React, { useState, useEffect } from 'react';
import URLSection from './components/URLSection';
import FormatSection from './components/FormatSection';
import LocationSection from './components/LocationSection';
import ProgressSection from './components/ProgressSection';
import DownloadButton from './components/DownloadButton';
import FailedDownloads from './components/FailedDownloads';

function App() {
  const [url, setUrl] = useState('');
  const [format, setFormat] = useState('mp3_320');
  const [downloadPath, setDownloadPath] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('Ready to download your music! 🎵');
  const [activeTab, setActiveTab] = useState('download');
  const [failedDownloads, setFailedDownloads] = useState([]);

  // Load preferences on mount
  useEffect(() => {
    const loadPreferences = async () => {
      if (window.electronAPI) {
        try {
          const prefs = await window.electronAPI.getPreferences();
          setUrl(prefs.last_url || '');
          setFormat(prefs.format || 'mp3_320');
          setDownloadPath(prefs.download_path || '');
        } catch (error) {
          console.error('Error loading preferences:', error);
        }
      }
    };

    loadPreferences();
  }, []);

  // Save preferences when values change
  useEffect(() => {
    const savePreferences = async () => {
      if (window.electronAPI) {
        try {
          await window.electronAPI.savePreferences({
            last_url: url,
            format: format,
            download_path: downloadPath
          });
        } catch (error) {
          console.error('Error saving preferences:', error);
        }
      }
    };

    // Debounce the save operation
    const timeoutId = setTimeout(savePreferences, 500);
    return () => clearTimeout(timeoutId);
  }, [url, format, downloadPath]);

  // Listen for download progress updates
  useEffect(() => {
    if (window.electronAPI) {
      const handleProgress = (data) => {
        console.log('Progress update:', data);
        
        switch (data.status) {
          case 'starting':
            setProgress(10);
            setStatus('🚀 Starting download...');
            break;
          case 'queued':
            setProgress(20);
            setStatus(data.message);
            break;
          case 'processing':
            setProgress(30 + Math.random() * 30); // 30-60%
            setStatus(`⏳ ${data.message}`);
            break;
          case 'downloading':
            setProgress(60 + (data.progress || 0) * 0.25); // 60-85%
            setStatus(`⬇️ ${data.message}`);
            break;
          case 'converting':
            setProgress(90);
            setStatus('🎵 Converting to DJ-ready MP3 320kbps...');
            break;
          case 'completed':
            setProgress(100);
            setStatus(data.message);
            setIsDownloading(false);
            break;
          case 'error':
            setStatus(`❌ ${data.message}`);
            setIsDownloading(false);
            // Add to failed downloads list
            setFailedDownloads(prev => [...prev, {
              url: url,
              format: format,
              reason: data.message,
              timestamp: Date.now()
            }]);
            break;
          case 'cancelled':
            setStatus('⏹️ Download cancelled by user');
            setProgress(0);
            setIsDownloading(false);
            break;
          default:
            setStatus(data.message);
        }
      };

      window.electronAPI.onDownloadProgress(handleProgress);

      return () => {
        window.electronAPI.removeAllListeners('download-progress');
      };
    }
  }, []);

  const validateInputs = () => {
    if (!url.trim()) {
      setStatus('❌ Please enter a Tidal URL');
      return false;
    }

    if (!url.includes('tidal.com')) {
      setStatus('❌ Please enter a valid Tidal URL');
      return false;
    }

    if (!downloadPath.trim()) {
      setStatus('❌ Please select a download folder');
      return false;
    }

    return true;
  };

  const handleStartDownload = async () => {
    if (!validateInputs()) {
      return;
    }

    setIsDownloading(true);
    setProgress(0);
    setStatus('🚀 Preparing download...');

    try {
      await window.electronAPI.startDownload({
        url: url.trim(),
        format,
        downloadPath
      });
    } catch (error) {
      console.error('Download error:', error);
      setStatus(`❌ Download failed: ${error.message}`);
      setIsDownloading(false);
      // Add to failed downloads list
      setFailedDownloads(prev => [...prev, {
        url: url,
        format: format,
        reason: error.message,
        timestamp: Date.now()
      }]);
    }
  };

  const handleCancelDownload = async () => {
    try {
      await window.electronAPI.cancelDownload();
    } catch (error) {
      console.error('Cancel error:', error);
    }
  };

  const handleRetryDownload = (failedItem) => {
    setUrl(failedItem.url);
    setFormat(failedItem.format);
    setActiveTab('download');
    // Auto-start the download
    setTimeout(() => {
      handleStartDownload();
    }, 100);
  };

  const handleRemoveFailedDownload = (index) => {
    setFailedDownloads(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="app">
      <div className="container">
        <div className="title">
          <span className="title-emoji">🎵</span>
          TIDAL DOWNLOADER
        </div>

        {/* Tab Navigation */}
        <div className="tab-navigation">
          <button
            className={`tab-button ${activeTab === 'download' ? 'active' : ''}`}
            onClick={() => setActiveTab('download')}
          >
            📥 Download
          </button>
          <button
            className={`tab-button ${activeTab === 'failed' ? 'active' : ''}`}
            onClick={() => setActiveTab('failed')}
          >
            ❌ Failed ({failedDownloads.length})
          </button>
        </div>

        {/* Download Tab */}
        {activeTab === 'download' && (
          <>
            <URLSection 
              url={url} 
              setUrl={setUrl}
              disabled={isDownloading}
            />

            <FormatSection 
              format={format} 
              setFormat={setFormat}
              disabled={isDownloading}
            />

            <LocationSection 
              downloadPath={downloadPath} 
              setDownloadPath={setDownloadPath}
              disabled={isDownloading}
            />

            <ProgressSection 
              progress={progress}
              status={status}
            />

            <DownloadButton
              onStartDownload={handleStartDownload}
              onCancelDownload={handleCancelDownload}
              isDownloading={isDownloading}
              disabled={isDownloading}
            />
          </>
        )}

        {/* Failed Downloads Tab */}
        {activeTab === 'failed' && (
          <FailedDownloads
            failedDownloads={failedDownloads}
            onRetry={handleRetryDownload}
            onRemove={handleRemoveFailedDownload}
          />
        )}
      </div>
    </div>
  );
}

export default App;