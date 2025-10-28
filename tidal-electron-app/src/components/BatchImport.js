import React, { useState } from 'react';

function BatchImport({ onBatchSearch, downloadPath }) {
  const [songList, setSongList] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedTracks, setSelectedTracks] = useState(new Set());
  const [status, setStatus] = useState('');

  const handleSearch = async () => {
    if (!songList.trim()) {
      setStatus('Please enter at least one song');
      return;
    }

    if (!downloadPath.trim()) {
      setStatus('Please select a download folder first');
      return;
    }

    setIsSearching(true);
    setStatus('Searching for songs...');
    setSearchResults(null);
    setSelectedTracks(new Set());

    try {
      const songs = songList
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'));

      if (songs.length === 0) {
        setStatus('No valid songs to search');
        setIsSearching(false);
        return;
      }

      const results = await window.electronAPI.batchSearch(songs);
      setSearchResults(results);

      // Auto-select first result for each query
      const autoSelected = new Set();
      results.results.forEach((result, queryIndex) => {
        if (result.success && result.tracks && result.tracks.length > 0) {
          autoSelected.add(`${queryIndex}-0`);
        }
      });
      setSelectedTracks(autoSelected);

      const successCount = results.results.filter(r => r.success).length;
      setStatus(`Found results for ${successCount}/${results.total_queries} songs`);
    } catch (error) {
      console.error('Batch search error:', error);
      setStatus(`Error: ${error.message}`);
    }

    setIsSearching(false);
  };

  const toggleTrackSelection = (queryIndex, trackIndex) => {
    const key = `${queryIndex}-${trackIndex}`;
    const newSelected = new Set(selectedTracks);

    // Unselect all tracks for this query
    Array.from(selectedTracks).forEach(selectedKey => {
      if (selectedKey.startsWith(`${queryIndex}-`)) {
        newSelected.delete(selectedKey);
      }
    });

    // Select the new track
    if (!selectedTracks.has(key)) {
      newSelected.add(key);
    }

    setSelectedTracks(newSelected);
  };

  const handleAddToQueue = async () => {
    if (!searchResults || selectedTracks.size === 0) {
      setStatus('Please select at least one track');
      return;
    }

    setStatus('Adding selected tracks to queue...');

    let addedCount = 0;
    let failedCount = 0;

    for (const key of selectedTracks) {
      const [queryIndex, trackIndex] = key.split('-').map(Number);
      const result = searchResults.results[queryIndex];

      if (result.success && result.tracks[trackIndex]) {
        const track = result.tracks[trackIndex];

        try {
          const addResult = await window.electronAPI.addToQueue({
            url: track.url,
            format: 'mp3_320',
            downloadPath: downloadPath
          });

          if (addResult.success) {
            addedCount++;
          } else {
            failedCount++;
          }
        } catch (error) {
          console.error('Error adding track to queue:', error);
          failedCount++;
        }
      }
    }

    setStatus(`✅ Added ${addedCount} songs to queue${failedCount > 0 ? `, ${failedCount} failed` : ''}`);

    // Clear form after successful add
    if (addedCount > 0) {
      setSongList('');
      setSearchResults(null);
      setSelectedTracks(new Set());
    }
  };

  const handleClearResults = () => {
    setSearchResults(null);
    setSelectedTracks(new Set());
    setStatus('');
  };

  return (
    <div className="batch-import">
      <div className="section">
        <div className="section-title">📝 Batch Import Songs</div>
        <div className="help-text">
          Enter songs to search, one per line. Format: "Song Name - Artist Name"
        </div>

        <textarea
          className="batch-textarea"
          value={songList}
          onChange={(e) => setSongList(e.target.value)}
          placeholder={`Example:\nBohemian Rhapsody - Queen\nStairway to Heaven - Led Zeppelin\nHotel California - Eagles\n\n# Lines starting with # are ignored as comments`}
          disabled={isSearching}
          rows={10}
        />

        <div className="batch-button-group">
          <button
            className="batch-search-btn"
            onClick={handleSearch}
            disabled={isSearching || !songList.trim()}
          >
            {isSearching ? '🔍 Searching...' : '🔍 Search Songs'}
          </button>

          {searchResults && (
            <button
              className="batch-clear-btn"
              onClick={handleClearResults}
              disabled={isSearching}
            >
              🗑️ Clear Results
            </button>
          )}
        </div>

        {status && (
          <div className="batch-status">
            {status}
          </div>
        )}
      </div>

      {searchResults && (
        <div className="section">
          <div className="section-title">🎵 Search Results</div>
          <div className="help-text">
            Select one track per song to add to download queue
          </div>

          <div className="search-results-container">
            {searchResults.results.map((result, queryIndex) => (
              <div key={queryIndex} className="search-result-group">
                <div className="search-query">
                  Query: <strong>{result.query}</strong>
                  {!result.success && (
                    <span className="error-badge">❌ No results</span>
                  )}
                </div>

                {result.success && result.tracks.length > 0 && (
                  <div className="track-options">
                    {result.tracks.map((track, trackIndex) => {
                      const key = `${queryIndex}-${trackIndex}`;
                      const isSelected = selectedTracks.has(key);

                      return (
                        <div
                          key={trackIndex}
                          className={`track-option ${isSelected ? 'selected' : ''}`}
                          onClick={() => toggleTrackSelection(queryIndex, trackIndex)}
                        >
                          <div className="track-select-box">
                            {isSelected ? '✓' : ''}
                          </div>
                          <div className="track-info">
                            <div className="track-title">{track.title}</div>
                            <div className="track-artist">{track.artist}</div>
                            {track.album && (
                              <div className="track-album">Album: {track.album}</div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {result.success && result.tracks.length === 0 && (
                  <div className="no-results">No tracks found</div>
                )}
              </div>
            ))}
          </div>

          <div className="batch-add-section">
            <button
              className="batch-add-btn"
              onClick={handleAddToQueue}
              disabled={selectedTracks.size === 0}
            >
              ➕ Add {selectedTracks.size} Selected Song{selectedTracks.size !== 1 ? 's' : ''} to Queue
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default BatchImport;
