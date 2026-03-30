#!/usr/bin/env python3
"""
Music Service Abstraction Layer
Provides a flexible interface for searching and downloading music from various streaming services
"""

from abc import ABC, abstractmethod
from typing import List, Dict, Optional
import logging

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class Track:
    """Represents a music track from any service"""

    def __init__(
        self,
        title: str,
        artist: str,
        url: str,
        service: str,
        album: Optional[str] = None,
        duration: Optional[int] = None,
        track_id: Optional[str] = None
    ):
        self.title = title
        self.artist = artist
        self.url = url
        self.service = service
        self.album = album
        self.duration = duration
        self.track_id = track_id

    def to_dict(self) -> Dict:
        """Convert track to dictionary"""
        return {
            'title': self.title,
            'artist': self.artist,
            'url': self.url,
            'service': self.service,
            'album': self.album,
            'duration': self.duration,
            'track_id': self.track_id
        }

    def __repr__(self):
        return f"Track(title='{self.title}', artist='{self.artist}', service='{self.service}')"


class MusicService(ABC):
    """Abstract base class for music streaming services"""

    @abstractmethod
    def search_track(self, query: str) -> List[Track]:
        """
        Search for a track by query string

        Args:
            query: Search query (e.g., "Song Name - Artist" or "Artist - Song Name")

        Returns:
            List of Track objects matching the query
        """
        pass

    @abstractmethod
    def get_service_name(self) -> str:
        """Return the name of the service (e.g., 'tidal', 'amazon')"""
        pass


class TidalService(MusicService):
    """Tidal music service implementation"""

    def __init__(self):
        self.session = None
        self._initialized = False

    def _initialize(self):
        """Initialize the Tidal session (lazy initialization)"""
        if self._initialized:
            return True

        try:
            import tidalapi

            self.session = tidalapi.Session()

            # Try to login with OAuth
            # This will prompt user to visit a URL and authenticate
            login_result = self.session.login_oauth_simple()

            if login_result:
                self._initialized = True
                logger.info("Tidal session initialized successfully")
                return True
            else:
                logger.error("Failed to authenticate with Tidal")
                return False

        except ImportError:
            logger.error("tidalapi library not installed. Install with: pip3 install tidalapi")
            raise ImportError("tidalapi library required. Install with: pip3 install tidalapi")
        except Exception as e:
            logger.error(f"Failed to initialize Tidal session: {e}")
            return False

    def search_track(self, query: str, limit: int = 5) -> List[Track]:
        """
        Search for tracks on Tidal

        Args:
            query: Search query
            limit: Maximum number of results to return (default: 5)

        Returns:
            List of Track objects
        """
        if not self._initialized:
            self._initialize()

        if not self.session:
            logger.error("Tidal session not initialized")
            return []

        try:
            import tidalapi

            # Search for tracks
            logger.info(f"Searching Tidal for: {query}")
            search_results = self.session.search(query, models=[tidalapi.Track], limit=limit)

            tracks = []
            if 'tracks' in search_results and search_results['tracks']:
                for tidal_track in search_results['tracks']:
                    # Get artist name(s)
                    artist_names = []
                    if hasattr(tidal_track, 'artist') and tidal_track.artist:
                        artist_names.append(tidal_track.artist.name)
                    elif hasattr(tidal_track, 'artists') and tidal_track.artists:
                        artist_names = [artist.name for artist in tidal_track.artists]

                    artist = ', '.join(artist_names) if artist_names else 'Unknown Artist'

                    # Get album name
                    album = None
                    if hasattr(tidal_track, 'album') and tidal_track.album:
                        album = tidal_track.album.name

                    # Construct Tidal URL
                    track_url = f"https://tidal.com/browse/track/{tidal_track.id}"

                    track = Track(
                        title=tidal_track.name,
                        artist=artist,
                        url=track_url,
                        service='tidal',
                        album=album,
                        duration=tidal_track.duration if hasattr(tidal_track, 'duration') else None,
                        track_id=str(tidal_track.id)
                    )
                    tracks.append(track)
                    logger.info(f"Found: {track.title} by {track.artist}")

            logger.info(f"Found {len(tracks)} tracks for query: {query}")
            return tracks

        except Exception as e:
            logger.error(f"Error searching Tidal: {e}", exc_info=True)
            return []

    def get_service_name(self) -> str:
        return 'tidal'


class AmazonMusicService(MusicService):
    """Amazon Music service implementation (placeholder for future)"""

    def search_track(self, query: str) -> List[Track]:
        """
        Search for tracks on Amazon Music

        Note: This is a placeholder implementation for future development
        """
        logger.warning("Amazon Music search not yet implemented")
        return []

    def get_service_name(self) -> str:
        return 'amazon_music'


class MusicServiceFactory:
    """Factory for creating music service instances"""

    _services = {
        'tidal': TidalService,
        'amazon_music': AmazonMusicService,
    }

    @classmethod
    def get_service(cls, service_name: str) -> MusicService:
        """
        Get a music service instance by name

        Args:
            service_name: Name of the service ('tidal', 'amazon_music', etc.)

        Returns:
            Instance of the requested music service

        Raises:
            ValueError: If service is not supported
        """
        service_class = cls._services.get(service_name.lower())
        if not service_class:
            raise ValueError(f"Unsupported service: {service_name}. Supported services: {list(cls._services.keys())}")

        return service_class()

    @classmethod
    def get_available_services(cls) -> List[str]:
        """Get list of available service names"""
        return list(cls._services.keys())


def parse_song_query(line: str) -> str:
    """
    Parse a song query line and extract meaningful search terms

    Supports formats:
    - "Song Name - Artist Name"
    - "Artist Name - Song Name"
    - "Song Name"

    Args:
        line: Input line with song information

    Returns:
        Cleaned search query
    """
    # Remove extra whitespace
    line = ' '.join(line.split())

    # Remove common prefixes/suffixes
    line = line.strip()

    return line


def batch_search(
    queries: List[str],
    service_name: str = 'tidal',
    results_per_query: int = 5
) -> List[Dict]:
    """
    Batch search for multiple songs

    Args:
        queries: List of search queries
        service_name: Name of the service to search (default: 'tidal')
        results_per_query: Number of results per query (default: 5)

    Returns:
        List of dictionaries containing search results for each query
    """
    try:
        service = MusicServiceFactory.get_service(service_name)
    except ValueError as e:
        logger.error(str(e))
        return []

    results = []
    for i, query in enumerate(queries, 1):
        logger.info(f"Processing {i}/{len(queries)}: {query}")

        # Parse the query
        parsed_query = parse_song_query(query)

        # Search for tracks
        tracks = service.search_track(parsed_query, limit=results_per_query)

        results.append({
            'query': query,
            'parsed_query': parsed_query,
            'tracks': [track.to_dict() for track in tracks]
        })

    return results


if __name__ == '__main__':
    # Example usage
    import sys

    if len(sys.argv) < 2:
        print("Usage: python3 music_service.py <search_query>")
        print("Example: python3 music_service.py 'Bohemian Rhapsody - Queen'")
        sys.exit(1)

    query = ' '.join(sys.argv[1:])

    # Test Tidal search
    service = TidalService()
    tracks = service.search_track(query)

    print(f"\n🎵 Search results for: {query}\n")
    for i, track in enumerate(tracks, 1):
        print(f"{i}. {track.title}")
        print(f"   Artist: {track.artist}")
        print(f"   Album: {track.album}")
        print(f"   URL: {track.url}")
        print()
