#!/usr/bin/env node

/**
 * Test script for fetchSongMetadata function
 * Tests metadata extraction from Tidal URLs
 */

const https = require('https');

// Helper function from main.js
function cleanTidalUrl(url) {
  try {
    const urlObj = new URL(url);
    // Remove tracking parameters like ?u
    urlObj.search = '';
    return urlObj.toString();
  } catch (error) {
    return url; // Return original if parsing fails
  }
}

// fetchSongMetadata function from main.js
function fetchSongMetadata(url) {
  return new Promise((resolve, reject) => {
    const cleanUrl = cleanTidalUrl(url);
    
    console.log(`🔍 Testing metadata extraction for: ${url}`);
    console.log(`📝 Cleaned URL: ${cleanUrl}`);
    
    https.get(cleanUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'
      }
    }, (res) => {
      let html = '';
      
      res.on('data', (chunk) => {
        html += chunk;
      });
      
      res.on('end', () => {
        try {
          // Debug: log the HTML content
          console.log(`📄 Fetched HTML length: ${html.length} characters`);
          console.log(`📄 HTML preview (first 500 chars):\n${html.substring(0, 500)}...\n`);
          
          // Extract song title from meta tags or title
          let title = 'Unknown Track';
          let artist = 'Unknown Artist';
          
          // Try to extract from JSON-LD structured data first
          const jsonLdMatches = html.match(/<script[^>]*type=["\']application\/ld\+json["\'][^>]*>(.*?)<\/script>/gis);
          if (jsonLdMatches) {
            console.log(`🔍 Found ${jsonLdMatches.length} JSON-LD script(s)`);
            for (const match of jsonLdMatches) {
              try {
                const jsonContent = match.replace(/<script[^>]*>/, '').replace(/<\/script>/, '');
                const jsonData = JSON.parse(jsonContent);
                
                console.log('📊 JSON-LD data structure:', JSON.stringify(jsonData, null, 2));
                
                // Look for MusicRecording type
                if (jsonData['@type'] === 'MusicRecording' || 
                    (Array.isArray(jsonData) && jsonData.some(item => item['@type'] === 'MusicRecording'))) {
                  
                  const musicData = Array.isArray(jsonData) ? 
                    jsonData.find(item => item['@type'] === 'MusicRecording') : jsonData;
                  
                  if (musicData.name) {
                    title = musicData.name;
                    console.log('✅ Found title in JSON-LD:', title);
                  }
                  
                  if (musicData.byArtist) {
                    if (Array.isArray(musicData.byArtist)) {
                      artist = musicData.byArtist.map(a => a.name).join(', ');
                    } else if (musicData.byArtist.name) {
                      artist = musicData.byArtist.name;
                    }
                    console.log('✅ Found artist in JSON-LD:', artist);
                  }
                  
                  break; // Found what we need
                }
              } catch (e) {
                // Continue to next JSON-LD block
                console.log('❌ Failed to parse JSON-LD block:', e.message);
              }
            }
          } else {
            console.log('❌ No JSON-LD scripts found');
          }
          
          // Try various meta tags for title and artist
          if (title === 'Unknown Track') {
            console.log('🔍 Trying meta tags for title...');
            
            // Try og:title
            const ogTitleMatch = html.match(/<meta[^>]*property=["\']og:title["\'][^>]*content=["\']([^"']+)["\'][^>]*>/i);
            if (ogTitleMatch) {
              title = ogTitleMatch[1];
              console.log('✅ Found title in og:title:', title);
            }
            
            // Try twitter:title
            const twitterTitleMatch = html.match(/<meta[^>]*name=["\']twitter:title["\'][^>]*content=["\']([^"']+)["\'][^>]*>/i);
            if (twitterTitleMatch && title === 'Unknown Track') {
              title = twitterTitleMatch[1];
              console.log('✅ Found title in twitter:title:', title);
            }
          }
          
          if (artist === 'Unknown Artist') {
            console.log('🔍 Trying meta tags for artist...');
            
            // Try og:description which might contain artist info
            const ogDescMatch = html.match(/<meta[^>]*property=["\']og:description["\'][^>]*content=["\']([^"']+)["\'][^>]*>/i);
            if (ogDescMatch) {
              const desc = ogDescMatch[1];
              console.log('📝 Found og:description:', desc);
              // Look for "by Artist" pattern in description
              const byMatch = desc.match(/by\s+([^,\n\r]+)/i);
              if (byMatch) {
                artist = byMatch[1].trim();
                console.log('✅ Found artist in og:description:', artist);
              }
            }
            
            // Try twitter:audio:artist
            const twitterArtistMatch = html.match(/<meta[^>]*name=["\']twitter:audio:artist["\'][^>]*content=["\']([^"']+)["\'][^>]*>/i);
            if (twitterArtistMatch) {
              artist = twitterArtistMatch[1];
              console.log('✅ Found artist in twitter:audio:artist:', artist);
            }
          }
          
          // Fallback: Try to extract from title tag if still unknown
          if (title === 'Unknown Track') {
            console.log('🔍 Trying page title as fallback...');
            const pageTitleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
            if (pageTitleMatch) {
              const fullTitle = pageTitleMatch[1].replace(' - TIDAL', '').trim();
              console.log('📝 Found page title:', fullTitle);
              const byMatch = fullTitle.match(/^(.+?)\s+by\s+(.+)$/i);
              if (byMatch) {
                title = byMatch[1].trim();
                if (artist === 'Unknown Artist') {
                  artist = byMatch[2].trim();
                }
                console.log('✅ Parsed title and artist from page title:', title, 'by', artist);
              } else {
                title = fullTitle;
                console.log('✅ Used full page title:', title);
              }
            }
          }
          
          console.log('\n🎵 Final extracted metadata:');
          console.log(`   Title: ${title}`);
          console.log(`   Artist: ${artist}`);
          
          resolve({
            title: title,
            artist: artist,
            url: cleanUrl,
            originalUrl: url
          });
        } catch (error) {
          console.error('❌ Failed to parse song metadata:', error);
          reject(new Error('Failed to parse song metadata'));
        }
      });
    }).on('error', (error) => {
      console.error('❌ HTTP request failed:', error);
      reject(error);
    });
  });
}

// Test function
async function testMetadataFetching() {
  const testUrl = 'https://tidal.com/browse/track/431665151?u';
  
  console.log('🚀 Starting metadata fetch test...\n');
  
  try {
    const startTime = Date.now();
    const metadata = await fetchSongMetadata(testUrl);
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log('\n✅ Test completed successfully!');
    console.log(`⏱️  Execution time: ${duration}ms`);
    console.log('\n📊 Complete metadata object:');
    console.log(JSON.stringify(metadata, null, 2));
    
    // Validate the results
    console.log('\n🔍 Validation:');
    console.log(`   ✓ Title extracted: ${metadata.title !== 'Unknown Track' ? 'YES' : 'NO'}`);
    console.log(`   ✓ Artist extracted: ${metadata.artist !== 'Unknown Artist' ? 'YES' : 'NO'}`);
    console.log(`   ✓ URL cleaned: ${metadata.url !== metadata.originalUrl ? 'YES' : 'NO'}`);
    
  } catch (error) {
    console.error('\n❌ Test failed:');
    console.error('   Error:', error.message);
    console.error('   Stack:', error.stack);
  }
}

// Run the test
if (require.main === module) {
  testMetadataFetching().then(() => {
    console.log('\n🏁 Test script completed.');
    process.exit(0);
  }).catch((error) => {
    console.error('\n💥 Test script failed:', error);
    process.exit(1);
  });
}

module.exports = { fetchSongMetadata, cleanTidalUrl, testMetadataFetching };