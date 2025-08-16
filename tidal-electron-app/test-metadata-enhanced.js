#!/usr/bin/env node

/**
 * Enhanced test script for fetchSongMetadata function
 * Includes detailed HTML analysis and alternative extraction methods
 */

const https = require('https');
const fs = require('fs');

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

// Enhanced metadata extraction with more debugging
function fetchSongMetadataEnhanced(url) {
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
      
      console.log(`📡 Response status: ${res.statusCode}`);
      console.log(`📡 Response headers:`, res.headers);
      
      res.on('data', (chunk) => {
        html += chunk;
      });
      
      res.on('end', () => {
        try {
          console.log(`📄 Fetched HTML length: ${html.length} characters`);
          
          // Save HTML to file for inspection
          fs.writeFileSync('/tmp/tidal_page.html', html);
          console.log('💾 HTML saved to /tmp/tidal_page.html for inspection');
          
          let title = 'Unknown Track';
          let artist = 'Unknown Artist';
          
          // Look for all meta tags
          console.log('\n🔍 Analyzing all meta tags...');
          const metaTags = html.match(/<meta[^>]*>/gi) || [];
          console.log(`Found ${metaTags.length} meta tags`);
          
          metaTags.forEach((tag, index) => {
            if (tag.includes('title') || tag.includes('artist') || tag.includes('song') || tag.includes('music')) {
              console.log(`Meta ${index + 1}: ${tag}`);
            }
          });
          
          // Look for all script tags
          console.log('\n🔍 Analyzing script tags...');
          const scriptTags = html.match(/<script[^>]*>[\s\S]*?<\/script>/gi) || [];
          console.log(`Found ${scriptTags.length} script tags`);
          
          // Check for JSON-LD
          const jsonLdMatches = html.match(/<script[^>]*type=["\']application\/ld\+json["\'][^>]*>(.*?)<\/script>/gis);
          if (jsonLdMatches) {
            console.log(`🔍 Found ${jsonLdMatches.length} JSON-LD script(s)`);
            jsonLdMatches.forEach((match, index) => {
              try {
                const jsonContent = match.replace(/<script[^>]*>/, '').replace(/<\/script>/, '');
                const jsonData = JSON.parse(jsonContent);
                console.log(`JSON-LD ${index + 1}:`, JSON.stringify(jsonData, null, 2));
              } catch (e) {
                console.log(`❌ Failed to parse JSON-LD ${index + 1}:`, e.message);
              }
            });
          }
          
          // Look for any data that might contain track info
          console.log('\n🔍 Searching for track/artist patterns in HTML...');
          
          // Look for common patterns
          const patterns = [
            /track["\s]*[:=]["\s]*([^"',\n]+)/gi,
            /title["\s]*[:=]["\s]*([^"',\n]+)/gi,
            /artist["\s]*[:=]["\s]*([^"',\n]+)/gi,
            /song["\s]*[:=]["\s]*([^"',\n]+)/gi,
            /"name"["\s]*:["\s]*"([^"]+)"/gi,
            /"byArtist"["\s]*:["\s]*"([^"]+)"/gi
          ];
          
          patterns.forEach((pattern, index) => {
            const matches = [...html.matchAll(pattern)];
            if (matches.length > 0) {
              console.log(`Pattern ${index + 1} matches:`, matches.map(m => m[1]).slice(0, 5)); // Show first 5 matches
            }
          });
          
          // Look for window.__INITIAL_STATE__ or similar
          console.log('\n🔍 Looking for initial state or config objects...');
          const statePatterns = [
            /window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});/,
            /window\.__STATE__\s*=\s*({[\s\S]*?});/,
            /window\.INITIAL_DATA\s*=\s*({[\s\S]*?});/,
            /__NEXT_DATA__\s*=\s*({[\s\S]*?})/
          ];
          
          statePatterns.forEach((pattern, index) => {
            const match = html.match(pattern);
            if (match) {
              console.log(`State pattern ${index + 1} found!`);
              try {
                const stateData = JSON.parse(match[1]);
                console.log('State data preview:', JSON.stringify(stateData, null, 2).substring(0, 500) + '...');
                
                // Try to find track info in the state
                const stateStr = JSON.stringify(stateData);
                const trackMatch = stateStr.match(/"title":\s*"([^"]+)"/);
                const artistMatch = stateStr.match(/"artist":\s*"([^"]+)"/);
                
                if (trackMatch) {
                  title = trackMatch[1];
                  console.log('✅ Found title in state:', title);
                }
                if (artistMatch) {
                  artist = artistMatch[1];
                  console.log('✅ Found artist in state:', artist);
                }
              } catch (e) {
                console.log('❌ Failed to parse state data:', e.message);
              }
            }
          });
          
          // Original extraction logic
          console.log('\n🔍 Running original extraction logic...');
          
          // Try og:title
          const ogTitleMatch = html.match(/<meta[^>]*property=["\']og:title["\'][^>]*content=["\']([^"']+)["\'][^>]*>/i);
          if (ogTitleMatch) {
            console.log('Found og:title:', ogTitleMatch[1]);
            if (title === 'Unknown Track') {
              title = ogTitleMatch[1];
            }
          }
          
          // Try twitter:title
          const twitterTitleMatch = html.match(/<meta[^>]*name=["\']twitter:title["\'][^>]*content=["\']([^"']+)["\'][^>]*>/i);
          if (twitterTitleMatch) {
            console.log('Found twitter:title:', twitterTitleMatch[1]);
            if (title === 'Unknown Track') {
              title = twitterTitleMatch[1];
            }
          }
          
          // Try page title
          const pageTitleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
          if (pageTitleMatch) {
            console.log('Found page title:', pageTitleMatch[1]);
            if (title === 'Unknown Track') {
              title = pageTitleMatch[1].replace(' - TIDAL', '').trim();
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
  
  console.log('🚀 Starting enhanced metadata fetch test...\n');
  
  try {
    const startTime = Date.now();
    const metadata = await fetchSongMetadataEnhanced(testUrl);
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
    console.log(`   💡 Recommendation: ${metadata.title === 'Unknown Track' ? 'Consider client-side rendering or API approach' : 'Working correctly'}`);
    
  } catch (error) {
    console.error('\n❌ Test failed:');
    console.error('   Error:', error.message);
    console.error('   Stack:', error.stack);
  }
}

// Run the test
if (require.main === module) {
  testMetadataFetching().then(() => {
    console.log('\n🏁 Enhanced test script completed.');
    process.exit(0);
  }).catch((error) => {
    console.error('\n💥 Enhanced test script failed:', error);
    process.exit(1);
  });
}