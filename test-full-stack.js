#!/usr/bin/env node

const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const execAsync = promisify(exec);

class FullStackTest {
  constructor() {
    this.electronProcess = null;
    this.logFile = '/tmp/tidal_downloader.log';
    this.downloadDir = path.join(process.env.HOME, 'Desktop/DJ/test_download');
  }

  log(message, type = 'INFO') {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${type}] ${message}`);
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async setupEnvironment() {
    this.log('🏗️  Setting up full stack test environment...');
    
    // Create download directory
    if (!fs.existsSync(this.downloadDir)) {
      fs.mkdirSync(this.downloadDir, { recursive: true });
    }
    
    // Clear logs
    if (fs.existsSync(this.logFile)) {
      fs.writeFileSync(this.logFile, '');
    }
    
    this.log('✅ Environment ready');
  }

  async startElectronWithMonitoring() {
    this.log('🚀 Starting Electron app with monitoring...');
    
    return new Promise((resolve, reject) => {
      this.electronProcess = spawn('npx', ['electron', '.'], {
        cwd: '/Users/codachang/Desktop/DJ/tidalDownloader/tidal-electron-app',
        stdio: 'pipe'
      });
      
      let isReady = false;
      
      this.electronProcess.stdout.on('data', (data) => {
        const output = data.toString();
        
        if (output.includes('Window ready to show') || output.includes('Page loaded successfully')) {
          if (!isReady) {
            isReady = true;
            this.log('✅ Electron app is ready for interaction');
            resolve();
          }
        }
        
        // Log IPC communications
        if (output.includes('fetchSongMetadata') || output.includes('add-to-queue')) {
          this.log(`📡 Frontend Activity: ${output.trim()}`);
        }
      });
      
      this.electronProcess.stderr.on('data', (data) => {
        this.log(`⚠️  Electron: ${data.toString().trim()}`);
      });
      
      setTimeout(() => {
        if (!isReady) {
          reject(new Error('Electron startup timeout'));
        }
      }, 30000);
    });
  }

  async testBackendDirectly() {
    this.log('🐍 Testing backend download directly...');
    
    try {
      const { stdout, stderr } = await execAsync(
        `python3 /Users/codachang/Desktop/DJ/tidalDownloader/tidal_downloader.py "https://tidal.com/browse/track/431665151" -o "${this.downloadDir}"`
      );
      
      this.log('✅ Backend download completed');
      
      // Check results
      const files = fs.readdirSync(this.downloadDir);
      const mp3Files = files.filter(f => f.endsWith('.mp3'));
      
      if (mp3Files.length > 0) {
        this.log(`✅ MP3 created: ${mp3Files[0]}`);
        return true;
      } else {
        this.log('❌ No MP3 file found');
        return false;
      }
      
    } catch (error) {
      this.log(`❌ Backend test failed: ${error.message}`);
      return false;
    }
  }

  async testFrontendBackendIntegration() {
    this.log('🔄 Testing frontend-backend integration...');
    
    // Monitor log file for activity
    let logWatcher = null;
    const logPromise = new Promise((resolve) => {
      if (fs.existsSync(this.logFile)) {
        const initialSize = fs.statSync(this.logFile).size;
        
        logWatcher = setInterval(() => {
          try {
            const currentSize = fs.statSync(this.logFile).size;
            if (currentSize > initialSize) {
              const newContent = fs.readFileSync(this.logFile, 'utf8').slice(initialSize);
              if (newContent.includes('Starting download for:')) {
                this.log('✅ Frontend triggered backend download!');
                clearInterval(logWatcher);
                resolve(true);
              }
            }
          } catch (e) {
            // File might not exist yet
          }
        }, 1000);
        
        // Timeout after 30 seconds
        setTimeout(() => {
          clearInterval(logWatcher);
          resolve(false);
        }, 30000);
      } else {
        resolve(false);
      }
    });
    
    // Give instructions for manual interaction
    this.log('\n🎯 MANUAL INTERACTION REQUIRED:');
    this.log('1. The Electron app should be running now');
    this.log('2. In the app, paste: https://tidal.com/browse/track/431665151?u');
    this.log('3. Click "Add to Queue" or press Enter');
    this.log('4. The system will detect when download starts...');
    this.log('\n⏳ Waiting up to 30 seconds for user interaction...');
    
    const integrationWorked = await logPromise;
    
    if (logWatcher) {
      clearInterval(logWatcher);
    }
    
    return integrationWorked;
  }

  async monitorDownloadProgress() {
    this.log('📊 Monitoring download progress...');
    
    let lastLogSize = fs.existsSync(this.logFile) ? fs.statSync(this.logFile).size : 0;
    let downloadStarted = false;
    let conversionDetected = false;
    
    for (let i = 0; i < 60; i++) { // Monitor for up to 60 seconds
      await this.sleep(1000);
      
      if (fs.existsSync(this.logFile)) {
        const currentSize = fs.statSync(this.logFile).size;
        if (currentSize > lastLogSize) {
          const newContent = fs.readFileSync(this.logFile, 'utf8').slice(lastLogSize);
          const lines = newContent.split('\n').filter(line => line.trim());
          
          for (const line of lines) {
            if (line.includes('Starting download for:')) {
              downloadStarted = true;
              this.log('📥 Download started');
            } else if (line.includes('Progress:')) {
              const match = line.match(/Progress: ([\d.]+)%/);
              if (match) {
                this.log(`📊 Progress: ${match[1]}%`);
              }
            } else if (line.includes('Converting') && line.includes('MP3')) {
              conversionDetected = true;
              this.log('🔄 MP3 conversion started');
            } else if (line.includes('Download completed successfully')) {
              this.log('✅ Download completed successfully!');
              return { downloadStarted, conversionDetected, completed: true };
            }
          }
          
          lastLogSize = currentSize;
        }
      }
      
      // Check for files in download directory
      const djDir = path.join(process.env.HOME, 'Desktop/DJ');
      if (fs.existsSync(djDir)) {
        const files = fs.readdirSync(djDir);
        const mp3Files = files.filter(f => f.endsWith('.mp3'));
        if (mp3Files.length > 0) {
          this.log(`✅ MP3 file detected: ${mp3Files[mp3Files.length - 1]}`);
          return { downloadStarted, conversionDetected, completed: true };
        }
      }
    }
    
    return { downloadStarted, conversionDetected, completed: false };
  }

  async runFullStackTest() {
    try {
      await this.setupEnvironment();
      await this.startElectronWithMonitoring();
      
      this.log('\n🎯 Starting Full Stack Test...');
      this.log('=============================');
      
      // Test 1: Backend works
      this.log('\n1️⃣  Testing Backend Directly:');
      const backendWorks = await this.testBackendDirectly();
      
      // Test 2: Frontend-Backend Integration
      this.log('\n2️⃣  Testing Frontend-Backend Integration:');
      const integrationWorks = await this.testFrontendBackendIntegration();
      
      // Test 3: Monitor Progress
      if (integrationWorks) {
        this.log('\n3️⃣  Monitoring Download Progress:');
        const progress = await this.monitorDownloadProgress();
        
        this.log('\n📊 FULL STACK TEST RESULTS:');
        this.log('===============================');
        this.log(`🐍 Backend Direct Test: ${backendWorks ? '✅ PASS' : '❌ FAIL'}`);
        this.log(`🔄 Frontend Integration: ${integrationWorks ? '✅ PASS' : '❌ FAIL'}`);
        this.log(`📥 Download Started: ${progress.downloadStarted ? '✅ YES' : '❌ NO'}`);
        this.log(`🔄 Conversion Detected: ${progress.conversionDetected ? '✅ YES' : '❌ NO'}`);
        this.log(`✅ Completed Successfully: ${progress.completed ? '✅ YES' : '❌ NO'}`);
        
        const allPass = backendWorks && integrationWorks && progress.completed;
        this.log(`\n🎯 OVERALL RESULT: ${allPass ? '✅ FULL STACK WORKING' : '⚠️  PARTIAL SUCCESS'}`);
        
        return allPass;
      } else {
        this.log('\n❌ Frontend integration failed - skipping progress monitoring');
        this.log(`\n🎯 RESULT: Backend works (${backendWorks ? 'YES' : 'NO'}), Frontend integration failed`);
        return false;
      }
      
    } catch (error) {
      this.log(`❌ Full stack test failed: ${error.message}`);
      return false;
    }
  }

  async cleanup() {
    this.log('\n🧽 Cleaning up...');
    
    if (this.electronProcess && !this.electronProcess.killed) {
      this.electronProcess.kill();
      this.log('✅ Electron process terminated');
    }
    
    // Clean up test downloads
    if (fs.existsSync(this.downloadDir)) {
      fs.rmSync(this.downloadDir, { recursive: true });
      this.log('✅ Test downloads cleaned up');
    }
  }
}

// Run the test
if (require.main === module) {
  const test = new FullStackTest();
  
  test.runFullStackTest()
    .then(success => {
      test.cleanup().then(() => {
        process.exit(success ? 0 : 1);
      });
    })
    .catch(error => {
      console.error('❌ Test runner error:', error);
      test.cleanup().then(() => process.exit(1));
    });
}