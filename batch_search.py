#!/usr/bin/env python3
"""
Batch Music Search Tool
Search for multiple songs at once and return results in JSON format
"""

import sys
import json
import argparse
from typing import List
from music_service import MusicServiceFactory, batch_search, parse_song_query
import logging

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('/tmp/batch_search.log'),
        logging.StreamHandler(sys.stderr)  # Log to stderr so stdout is clean for JSON
    ]
)
logger = logging.getLogger(__name__)


def read_song_list(input_source: str) -> List[str]:
    """
    Read song list from file or stdin

    Args:
        input_source: File path or '-' for stdin

    Returns:
        List of song query strings
    """
    songs = []

    if input_source == '-':
        logger.info("Reading from stdin...")
        for line in sys.stdin:
            line = line.strip()
            if line:
                songs.append(line)
    else:
        logger.info(f"Reading from file: {input_source}")
        try:
            with open(input_source, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith('#'):  # Ignore comments
                        songs.append(line)
        except FileNotFoundError:
            logger.error(f"File not found: {input_source}")
            sys.exit(1)
        except Exception as e:
            logger.error(f"Error reading file: {e}")
            sys.exit(1)

    logger.info(f"Loaded {len(songs)} songs")
    return songs


def search_single_track(query: str, service_name: str = 'tidal', limit: int = 5) -> dict:
    """
    Search for a single track

    Args:
        query: Search query
        service_name: Music service name
        limit: Number of results

    Returns:
        Dictionary with search results
    """
    try:
        service = MusicServiceFactory.get_service(service_name)
        parsed_query = parse_song_query(query)
        tracks = service.search_track(parsed_query, limit=limit)

        return {
            'success': True,
            'query': query,
            'parsed_query': parsed_query,
            'service': service_name,
            'count': len(tracks),
            'tracks': [track.to_dict() for track in tracks]
        }
    except Exception as e:
        logger.error(f"Error searching for '{query}': {e}", exc_info=True)
        return {
            'success': False,
            'query': query,
            'error': str(e)
        }


def main():
    parser = argparse.ArgumentParser(
        description='Batch search for music tracks across streaming services',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Search for a single track
  python3 batch_search.py "Bohemian Rhapsody - Queen"

  # Search from a file
  python3 batch_search.py -f songs.txt

  # Search from stdin
  echo "Song Name - Artist" | python3 batch_search.py -

  # Search with different service (future)
  python3 batch_search.py -s amazon_music "Song Name"

Song list format:
  One song per line, format can be:
  - "Song Name - Artist Name"
  - "Artist Name - Song Name"
  - "Song Name"

  Lines starting with # are ignored as comments.
        """
    )

    parser.add_argument(
        'query',
        nargs='?',
        help='Single search query (or - for stdin)'
    )
    parser.add_argument(
        '-f', '--file',
        help='File containing list of songs (one per line)'
    )
    parser.add_argument(
        '-s', '--service',
        default='tidal',
        choices=MusicServiceFactory.get_available_services(),
        help='Music service to search (default: tidal)'
    )
    parser.add_argument(
        '-l', '--limit',
        type=int,
        default=5,
        help='Number of results per query (default: 5)'
    )
    parser.add_argument(
        '-o', '--output',
        help='Output file for results (default: stdout)'
    )
    parser.add_argument(
        '--pretty',
        action='store_true',
        help='Pretty print JSON output'
    )

    args = parser.parse_args()

    # Determine input source
    if args.file:
        songs = read_song_list(args.file)
    elif args.query:
        if args.query == '-':
            songs = read_song_list('-')
        else:
            # Single query
            songs = [args.query]
    else:
        parser.print_help()
        sys.exit(1)

    if not songs:
        logger.error("No songs to search")
        sys.exit(1)

    # Perform batch search
    logger.info(f"Starting batch search for {len(songs)} songs on {args.service}")

    results = []
    for i, query in enumerate(songs, 1):
        logger.info(f"Searching {i}/{len(songs)}: {query}")
        result = search_single_track(query, args.service, args.limit)
        results.append(result)

        # Progress indicator to stderr
        print(f"Progress: {i}/{len(songs)}", file=sys.stderr)

    # Prepare output
    output_data = {
        'service': args.service,
        'total_queries': len(songs),
        'successful': sum(1 for r in results if r.get('success')),
        'failed': sum(1 for r in results if not r.get('success')),
        'results': results
    }

    # Output results as JSON
    json_indent = 2 if args.pretty else None
    json_output = json.dumps(output_data, indent=json_indent, ensure_ascii=False)

    if args.output:
        try:
            with open(args.output, 'w', encoding='utf-8') as f:
                f.write(json_output)
            logger.info(f"Results saved to: {args.output}")
        except Exception as e:
            logger.error(f"Error writing output file: {e}")
            sys.exit(1)
    else:
        # Write to stdout (clean for JSON parsing)
        print(json_output)

    # Summary to stderr
    print(f"\n✅ Search complete: {output_data['successful']} successful, {output_data['failed']} failed",
          file=sys.stderr)


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        logger.info("Search interrupted by user")
        sys.exit(130)
    except Exception as e:
        logger.error(f"Unexpected error: {e}", exc_info=True)
        sys.exit(1)
