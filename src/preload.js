const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
  'spotify',
  {
    getCurrentTrack: () => ipcRenderer.invoke('getCurrentTrack'),
    getQueue: () => ipcRenderer.invoke('getQueue'),
    playTrack: (uri) => ipcRenderer.invoke('playTrack', uri),
    skipInQueue: (uri) => ipcRenderer.invoke('skipInQueue', uri),
    playPause: () => ipcRenderer.invoke('playPause'),
    nextTrack: () => ipcRenderer.invoke('nextTrack'),
    previousTrack: () => ipcRenderer.invoke('previousTrack'),
    toggleShuffle: () => ipcRenderer.invoke('toggleShuffle'),
    toggleRepeat: () => ipcRenderer.invoke('toggleRepeat'),
    seekToPosition: (positionMs) => ipcRenderer.invoke('seekToPosition', positionMs),
    onTrackUpdate: (callback) => ipcRenderer.on('track-update', callback),
    onQueueUpdate: (callback) => ipcRenderer.on('queue-update', callback),
    updateWindowSize: (dimensions) => ipcRenderer.invoke('updateWindowSize', dimensions)
  }
); 