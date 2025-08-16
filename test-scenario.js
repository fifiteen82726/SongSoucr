#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class TidalDownloaderTest {
  constructor() {
    this.testDir = '/tmp/tidal_automated_test';
    this.logFile = '/tmp/tidal_downloader.log';
    this.testResults = [];
    this.electronProcess = null;
  }

  log(message, type = 'INFO') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${type}] ${message}`;
    console.log(logMessage);
    this.testResults.push(logMessage);
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async runCommand(command, args = [], options = {}) {
    return new Promise((resolve, reject) => {
      this.log(`Running: ${command} ${args.join(' ')}`);
      const proc = spawn(command, args, { 
        stdio: options.silent ? 'pipe' : 'inherit',
        ...options 
      });
      
      let stdout = '';
      let stderr = '';
      
      if (options.silent) {
        proc.stdout.on('data', (data) => stdout += data.toString());
        proc.stderr.on('data', (data) => stderr += data.toString());
      }
      
      proc.on('close', (code) => {
        if (code === 0) {
          resolve({ stdout, stderr, code });
        } else {
          reject(new Error(`Command failed with code ${code}: ${stderr}`));
        }
      });
      
      proc.on('error', reject);
    });
  }

  async setupTestEnvironment() {
    this.log('🏗️  Setting up test environment...');
    
    // Create test directory
    if (fs.existsSync(this.testDir)) {
      await this.runCommand('rm', ['-rf', this.testDir], { silent: true });
    }
    await this.runCommand('mkdir', ['-p', this.testDir], { silent: true });
    
    // Clear previous logs
    if (fs.existsSync(this.logFile)) {
      fs.writeFileSync(this.logFile, '');
    }
    
    this.log('✅ Test environment ready');
  }

  async startElectronApp() {
    this.log('🚀 Starting Electron app...');
    
    return new Promise((resolve, reject) => {
      this.electronProcess = spawn('npx', ['electron', '.'], {
        cwd: '/Users/codachang/Desktop/DJ/tidalDownloader/tidal-electron-app',
        stdio: 'pipe'
      });
      
      let output = '';
      this.electronProcess.stdout.on('data', (data) => {
        output += data.toString();
        if (output.includes('Window ready to show')) {
          this.log('✅ Electron app started successfully');
          resolve();
        }
      });
      
      this.electronProcess.stderr.on('data', (data) => {
        const error = data.toString();
        if (error.includes('Error')) {
          reject(new Error(`Electron startup failed: ${error}`));
        }
      });
      
      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.electronProcess) {
          reject(new Error('Electron app startup timeout'));
        }
      }, 30000);
    });
  }

  async testPythonScript() {
    this.log('🐍 Testing Python script directly...');
    
    const testUrl = 'https://tidal.com/browse/track/431665151';
    
    try {
      const startTime = Date.now();
      await this.runCommand('python3', [
        '/Users/codachang/Desktop/DJ/tidalDownloader/tidal_downloader.py',
        testUrl,
        '-o', this.testDir
      ]);
      
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      this.log(`✅ Python script completed in ${duration}s`);
      
      // Check if MP3 file was created
      const files = fs.readdirSync(this.testDir);
      const mp3Files = files.filter(f => f.endsWith('.mp3'));
      
      if (mp3Files.length > 0) {
        const mp3File = path.join(this.testDir, mp3Files[0]);
        const stats = fs.statSync(mp3File);
        const sizeMB = (stats.size / (1024 * 1024)).toFixed(1);
        this.log(`✅ MP3 file created: ${mp3Files[0]} (${sizeMB}MB)`);
        
        // Verify file format
        const { stdout } = await this.runCommand('file', [mp3File], { silent: true });
        if (stdout.includes('320 kbps')) {
          this.log('✅ MP3 quality verified: 320kbps');
        } else {
          this.log(`⚠️  MP3 quality check: ${stdout.trim()}`);
        }
        
        return true;
      } else {
        throw new Error('No MP3 file was created');
      }
      
    } catch (error) {
      this.log(`❌ Python script test failed: ${error.message}`, 'ERROR');
      return false;
    }
  }

  async testUrlCleaning() {
    this.log('🧹 Testing URL cleaning...');
    
    const testUrls = [
      'https://tidal.com/browse/track/431665151?u=12345',
      'https://tidal.com/browse/track/431665151?u=test&other=param',
      'https://tidal.com/browse/track/431665151'
    ];
    
    for (const url of testUrls) {
      try {
        // Test by checking log output
        const { stdout } = await this.runCommand('python3', [
          '-c', 
          `
import sys
sys.path.append('/Users/codachang/Desktop/DJ/tidalDownloader')
from tidal_downloader import TidalDownloader
downloader = TidalDownloader()
clean_url = downloader._clean_tidal_url('${url}')
print(f"Original: ${url}")
print(f"Cleaned: {clean_url}")
assert '?u=' not in clean_url, "URL cleaning failed"
print("✅ URL cleaning passed")
          `
        ], { silent: true });
        
        this.log(`✅ URL cleaning test passed for: ${url}`);
        
      } catch (error) {
        this.log(`❌ URL cleaning failed for ${url}: ${error.message}`, 'ERROR');
        return false;
      }
    }
    
    return true;
  }

  async monitorLogs(duration = 10000) {
    this.log(`👀 Monitoring logs for ${duration/1000} seconds...`);
    
    if (!fs.existsSync(this.logFile)) {
      this.log('⚠️  No log file found yet');
      return;
    }
    
    const initialSize = fs.statSync(this.logFile).size;
    await this.sleep(duration);
    
    try {
      const currentSize = fs.statSync(this.logFile).size;
      if (currentSize > initialSize) {
        const newContent = fs.readFileSync(this.logFile, 'utf8')
          .slice(initialSize)
          .split('\n')
          .filter(line => line.trim())
          .slice(-10); // Last 10 lines
        
        this.log('📋 Recent log entries:');
        newContent.forEach(line => this.log(`  ${line}`));
      } else {
        this.log('📋 No new log entries detected');
      }
    } catch (error) {
      this.log(`⚠️  Error reading logs: ${error.message}`);
    }
  }

  async cleanup() {
    this.log('🧽 Cleaning up...');
    
    // Kill Electron process
    if (this.electronProcess) {
      this.electronProcess.kill();
      this.log('✅ Electron process terminated');
    }
    
    // Remove test files
    if (fs.existsSync(this.testDir)) {
      await this.runCommand('rm', ['-rf', this.testDir], { silent: true });
      this.log('✅ Test files cleaned up');
    }
  }

  async runFullScenario() {
    const startTime = Date.now();
    this.log('🎯 Starting automated Tidal Downloader scenario test...');
    
    try {
      // Setup
      await this.setupTestEnvironment();
      
      // Test 1: URL Cleaning
      const urlTest = await this.testUrlCleaning();
      
      // Test 2: Python Script
      const pythonTest = await this.testPythonScript();
      
      // Test 3: Electron App
      await this.startElectronApp();
      await this.sleep(3000); // Let app settle
      
      // Test 4: Monitor logs
      await this.monitorLogs(5000);
      
      // Results
      const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
      
      this.log('\n📊 TEST RESULTS SUMMARY:');
      this.log(`⏱️  Total test duration: ${totalTime}s`);
      this.log(`🧹 URL Cleaning: ${urlTest ? '✅ PASS' : '❌ FAIL'}`);
      this.log(`🐍 Python Script: ${pythonTest ? '✅ PASS' : '❌ FAIL'}`);
      this.log(`🚀 Electron App: ✅ PASS (started successfully)`);
      
      const allPassed = urlTest && pythonTest;
      this.log(`\n🎯 OVERALL RESULT: ${allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
      
      return allPassed;
      
    } catch (error) {
      this.log(`❌ Test scenario failed: ${error.message}`, 'ERROR');
      return false;
    } finally {
      await this.cleanup();
    }
  }
}

// Run the test if called directly
if (require.main === module) {
  const test = new TidalDownloaderTest();
  test.runFullScenario()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Test runner error:', error);
      process.exit(1);
    });
}

module.exports = TidalDownloaderTest;