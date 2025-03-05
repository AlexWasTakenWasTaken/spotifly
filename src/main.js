// main.js
const spotifyClient = require('./spotifyClient');
const { app, BrowserWindow, globalShortcut, ipcMain } = require('electron');
const path = require('path');

let overlayWindow;
let trackUpdateInterval;

function createOverlayWindow() {
  overlayWindow = new BrowserWindow({
    width: 340,
    height: 400,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    minWidth: 320,
    minHeight: 200,
    useContentSize: true,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  overlayWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  overlayWindow.on('close', (event) => {
    event.preventDefault();
    overlayWindow.hide();
  });

  // Handle resize events to ensure content fits properly
  overlayWindow.on('resize', () => {
    // Ensure content fits properly without scrollbars
    overlayWindow.webContents.executeJavaScript(`
      if (typeof updateWindowSize === 'function') {
        updateWindowSize();
      }
    `).catch(err => console.error('Error during resize:', err));
  });

  overlayWindow.hide();
}

function setupSpotifyHandlers() {
  // Handle getCurrentTrack requests
  ipcMain.handle('getCurrentTrack', async () => {
    try {
      const trackData = await spotifyClient.getCurrentTrack();
      return trackData;
    } catch (error) {
      console.error('Failed to get current track:', error);
      return null;
    }
  });

  // Handle queue request
  ipcMain.handle('getQueue', async () => {
    try {
      return await spotifyClient.getQueue();
    } catch (error) {
      console.error('Failed to get queue:', error);
      return null;
    }
  });

  // Handle window size update
  ipcMain.handle('updateWindowSize', async (event, dimensions) => {
    if (overlayWindow) {
      try {
        // Get current position
        const position = overlayWindow.getPosition();
        
        // Set content size using both width and height
        const width = dimensions.width || overlayWindow.getContentSize()[0];
        const height = dimensions.height || overlayWindow.getContentSize()[1];
        
        // Set content size (different from window size - accounts for borders/chrome)
        overlayWindow.setContentSize(width, height);
        
        // Ensure window position remains the same
        overlayWindow.setPosition(position[0], position[1]);
        
        return true;
      } catch (error) {
        console.error('Error resizing window:', error);
        return false;
      }
    }
    return false;
  });

  // Handle playback control
  ipcMain.handle('playPause', () => spotifyClient.playPause());
  ipcMain.handle('nextTrack', () => spotifyClient.nextTrack());
  ipcMain.handle('previousTrack', () => spotifyClient.previousTrack());
  ipcMain.handle('playTrack', (event, uri) => spotifyClient.playTrack(uri));
  ipcMain.handle('skipInQueue', (event, uri) => spotifyClient.skipInQueue(uri));
  ipcMain.handle('toggleShuffle', () => spotifyClient.toggleShuffle());
  ipcMain.handle('toggleRepeat', () => spotifyClient.toggleRepeat());
  ipcMain.handle('seekToPosition', (event, positionMs) => spotifyClient.seekToPosition(positionMs));

  // Clear existing intervals if they exist
  if (trackUpdateInterval) {
    clearInterval(trackUpdateInterval);
  }
  
  // Track the last known track ID to detect song changes
  let lastTrackId = null;
  
  console.log('Setting up track and queue update interval');
  
  // Set up the high-frequency interval for track and queue updates
  trackUpdateInterval = setInterval(async () => {
    try {
      if (overlayWindow && overlayWindow.isVisible()) {
        // Collect track and queue data
        console.log('Fetching current track and queue data');
        const [trackData, queueData] = await Promise.all([
          spotifyClient.getCurrentTrack(),
          spotifyClient.getQueue()
        ]);
        
        console.log(`Current track: ${trackData?.item?.name || 'None'}`);
        
        // Update the last track ID
        if (trackData) {
          lastTrackId = trackData.id;
        }

        // Send track and queue updates
        if (trackData) {
          console.log('Sending track-update to renderer');
          overlayWindow.webContents.send('track-update', trackData);
        }
        
        if (queueData) {
          console.log(`Sending queue-update to renderer (${queueData?.queue?.length || 0} tracks)`);
          overlayWindow.webContents.send('queue-update', queueData);
        }
      } else {
        console.log('Window not visible, skipping track/queue updates');
      }
    } catch (error) {
      console.error('Failed to update track/queue data:', error);
    }
  }, 250); // Track and queue updates 4 times per second (250ms)
}

app.whenReady().then(async () => {
  try {
    console.log('Starting Spotify authentication process from main process');
    await spotifyClient.authenticate();
    console.log('Successfully authenticated with Spotify');
    setupSpotifyHandlers();
    createOverlayWindow();
    
    // Initial data fetch to check if everything is working
    try {
      console.log('Testing API with initial data fetch');
      // Fetch current track and queue
      const currentTrack = await spotifyClient.getCurrentTrack();
      console.log(`Initial current track: ${currentTrack?.item?.name || 'None'}`);
      
      // Removed recently played fetch
    } catch (apiError) {
      console.error('Initial API test failed:', apiError);
    }
  } catch (error) {
    console.error('Failed to authenticate:', error);
    // Try to create the overlay window anyway to show error state
    console.log('Creating overlay window despite authentication failure to show error state');
    setupSpotifyHandlers();
    createOverlayWindow();
  }

  // Set global shortcut regardless of authentication status
  globalShortcut.register('Alt+Space', () => {
    if (overlayWindow) {
      if (overlayWindow.isVisible()) {
        overlayWindow.hide();
      } else {
        overlayWindow.show();
        overlayWindow.focus();
      }
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createOverlayWindow();
    }
  });
});

app.on('before-quit', (event) => {
  if (trackUpdateInterval) {
    clearInterval(trackUpdateInterval);
  }
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  // Do nothing to keep the app running
});
