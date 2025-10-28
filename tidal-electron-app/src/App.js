import React, { useState, useEffect } from 'react';
import URLSection from './components/URLSection';
import FormatSection from './components/FormatSection';
import LocationSection from './components/LocationSection';
import ProgressSection from './components/ProgressSection';
import DownloadButton from './components/DownloadButton';
import FailedDownloads from './components/FailedDownloads';
import QueueSection from './components/QueueSection';
import BatchImport from './components/BatchImport';

function App() {
  const [url, setUrl] = useState('');
  const [format, setFormat] = useState('mp3_320');
  const [downloadPath, setDownloadPath] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('Ready to download your music! 🎵');
  const [activeTab, setActiveTab] = useState('download');
  const [failedDownloads, setFailedDownloads] = useState([]);
  const [queue, setQueue] = useState([]);
  const [isAddingToQueue, setIsAddingToQueue] = useState(false);

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

  // Listen for queue updates
  useEffect(() => {
    if (window.electronAPI) {
      const handleQueueUpdate = (queueData) => {
        console.log('Queue update:', queueData);
        setQueue(queueData);
      };

      window.electronAPI.onQueueUpdated(handleQueueUpdate);

      // Load initial queue
      const loadQueue = async () => {
        try {
          const initialQueue = await window.electronAPI.getQueue();
          setQueue(initialQueue);
        } catch (error) {
          console.error('Error loading queue:', error);
        }
      };

      loadQueue();

      return () => {
        window.electronAPI.removeAllListeners('queue-updated');
      };
    }
  }, []);

  const validateInputs = () => {
    if (!url.trim()) {
      setStatus('❌ Please enter a music URL');
      return false;
    }

    if (!url.includes('tidal.com') && !url.includes('music.amazon.com')) {
      setStatus('❌ Please enter a valid Tidal or Amazon Music URL');
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

  // Queue functions
  const handleAddToQueue = async () => {
    if (!validateInputs()) {
      return;
    }

    setIsAddingToQueue(true);
    setStatus('🔍 Fetching song information...');

    try {
      const result = await window.electronAPI.addToQueue({
        url: url.trim(),
        format,
        downloadPath
      });

      if (result.success) {
        setUrl(''); // Clear the input after successful addition
        setStatus(`✅ Added "${result.item.title}" by ${result.item.artist} to queue!`);
      } else {
        setStatus(`❌ Failed to add to queue: ${result.error}`);
      }
    } catch (error) {
      console.error('Error adding to queue:', error);
      setStatus(`❌ Error adding to queue: ${error.message}`);
    }

    setIsAddingToQueue(false);
  };

  const handleRetryQueueItem = async (itemId) => {
    try {
      await window.electronAPI.retryDownload(itemId);
    } catch (error) {
      console.error('Error retrying download:', error);
    }
  };

  const handleRemoveQueueItem = async (itemId) => {
    try {
      await window.electronAPI.removeFromQueue(itemId);
    } catch (error) {
      console.error('Error removing from queue:', error);
    }
  };

  return (
    <div className="app">
      <div className="container">
        <div className="title">
          <span className="title-emoji">🎵</span>
          MUSIC DOWNLOADER
        </div>

        {/* Tab Navigation */}
        <div className="tab-navigation">
          <button
            className={`tab-button ${activeTab === 'download' ? 'active' : ''}`}
            onClick={() => setActiveTab('download')}
          >
            📥 Add Songs
          </button>
          <button
            className={`tab-button ${activeTab === 'batch' ? 'active' : ''}`}
            onClick={() => setActiveTab('batch')}
          >
            📝 Batch Import
          </button>
          <button
            className={`tab-button ${activeTab === 'queue' ? 'active' : ''}`}
            onClick={() => setActiveTab('queue')}
          >
            📋 Queue ({queue.length})
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
              disabled={isAddingToQueue}
              loading={isAddingToQueue}
            />

            <FormatSection
              format={format}
              setFormat={setFormat}
              disabled={isAddingToQueue}
            />

            <LocationSection
              downloadPath={downloadPath}
              setDownloadPath={setDownloadPath}
              disabled={isAddingToQueue}
            />

            <div className="section status-section">
              <div className="status-text">
                {status}
              </div>
            </div>

            <div className="section button-section">
              <button
                className="add-to-queue-btn"
                onClick={handleAddToQueue}
                disabled={isAddingToQueue || !url.trim() || !downloadPath.trim()}
              >
                {isAddingToQueue ? '🔍 Fetching Info...' : '➕ Add to Queue'}
              </button>
            </div>
          </>
        )}

        {/* Batch Import Tab */}
        {activeTab === 'batch' && (
          <BatchImport
            onBatchSearch={() => {}}
            downloadPath={downloadPath}
          />
        )}

        {/* Queue Tab */}
        {activeTab === 'queue' && (
          <QueueSection
            queue={queue}
            onRetry={handleRetryQueueItem}
            onRemove={handleRemoveQueueItem}
            downloadPath={downloadPath}
          />
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