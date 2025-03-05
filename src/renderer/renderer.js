// Utility function for debouncing (limiting frequent calls)
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Format milliseconds to MM:SS format
function formatTime(ms) {
  if (!ms || isNaN(ms) || ms < 0) return '0:00';
  
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// Add a flag to track when we're hovering over items
let isHoveringTrackItem = false;
let lastHoveredTrack = null;
let isUpdatingTrackStyles = false;

// Variables for progress bar tracking
let currentTrackDuration = 0; // in ms
let currentTrackProgress = 0; // in ms
let progressTimer = null;
let currentTrackId = null; // To detect track changes

// Function to update the progress bar UI
function updateProgressBar(progressMs, durationMs) {
  const progressElem = document.getElementById('playback-progress');
  if (progressElem && durationMs > 0) {
    const percentage = Math.min((progressMs / durationMs) * 100, 100);
    progressElem.style.width = `${percentage}%`;
    
    // Update time displays
    const currentTimeElem = document.getElementById('current-time');
    const totalTimeElem = document.getElementById('total-time');
    
    if (currentTimeElem) {
      currentTimeElem.textContent = formatTime(progressMs);
    }
    
    if (totalTimeElem) {
      totalTimeElem.textContent = formatTime(durationMs);
    }
  }
}

// Start local timer to update progress bar without API calls
function startProgressTimer(isPlaying) {
  // Clear any existing timer
  if (progressTimer) clearInterval(progressTimer);
  
  if (!isPlaying) return; // do not update if paused
  
  const updateInterval = 250; // update every 250ms for smooth progress

  progressTimer = setInterval(() => {
    // Increase progress if less than duration
    if (currentTrackProgress < currentTrackDuration) {
      currentTrackProgress += updateInterval;
      updateProgressBar(currentTrackProgress, currentTrackDuration);
    } else {
      clearInterval(progressTimer);
    }
  }, updateInterval);
}

// Mouse position tracking for UI state management
window.mouseX = 0;
window.mouseY = 0;
document.addEventListener('mousemove', (e) => {
  window.mouseX = e.clientX;
  window.mouseY = e.clientY;
});

// Get DOM elements
const trackTitleElement = document.getElementById('track-title');
const artistNameElement = document.getElementById('artist-name');
const albumArtElement = document.getElementById('current-album-art');
const playPauseButton = document.getElementById('play-pause');
const prevButton = document.getElementById('prev');
const nextButton = document.getElementById('next');
const shuffleButton = document.getElementById('shuffle');
const repeatButton = document.getElementById('repeat');
const queueList = document.getElementById('queue-list');
const overlayContainer = document.querySelector('.overlay-container');

// Debounced version of the window size update - reduce to 25ms for quicker updates
const debouncedUpdateWindowSize = debounce(function() {
  const width = overlayContainer.offsetWidth;
  const height = overlayContainer.offsetHeight + 10; // Small buffer
  window.spotify.updateWindowSize({ width, height });
}, 25);

// Function to calculate and update window size
function updateWindowSize() {
  // Execute immediately to prevent flashing scrollbars
  const width = overlayContainer.offsetWidth;
  const height = overlayContainer.offsetHeight + 10; // Small buffer
  
  // Update the window size via IPC with both dimensions
  window.spotify.updateWindowSize({ width, height });
  
  console.log('Updating window size to:', width, height);
  
  // Use the debounced version for the follow-up check
  debouncedUpdateWindowSize();
}

// Function to calculate height of hidden elements and pre-resize the window
function preResizeForExpansion(selector) {
  const hiddenTracks = document.querySelectorAll(selector);
  if (hiddenTracks.length === 0) return;
  
  // Save current state of elements
  const originalStates = [];
  
  // Calculate total height by making elements temporarily visible but transparent
  hiddenTracks.forEach(track => {
    // Save original style state
    originalStates.push({
      element: track,
      display: track.style.display,
      visibility: track.style.visibility,
      position: track.style.position,
      opacity: track.style.opacity,
      pointerEvents: track.style.pointerEvents,
      zIndex: track.style.zIndex
    });
    
    // Make element visible but invisible for measurement
    track.style.display = 'flex';
    track.style.visibility = 'hidden';
    track.style.position = 'static'; // Ensure it affects layout
    track.style.opacity = '0';
    track.style.pointerEvents = 'none';
    track.style.zIndex = '-1';
  });
  
  // Force browser to recalculate layout
  void overlayContainer.offsetHeight;
  
  // Measure the expanded height and width
  const expandedWidth = overlayContainer.offsetWidth;
  const expandedHeight = overlayContainer.offsetHeight;
  
  // First update window size before restoring elements
  window.spotify.updateWindowSize({ width: expandedWidth, height: expandedHeight + 10 });
  
  // Now restore elements to original state, but with delay to ensure window resized first
  setTimeout(() => {
    // Restore original states
    originalStates.forEach(state => {
      state.element.style.display = state.display;
      state.element.style.visibility = state.visibility;
      state.element.style.position = state.position;
      state.element.style.opacity = state.opacity;
      state.element.style.pointerEvents = state.pointerEvents;
      state.element.style.zIndex = state.zIndex;
    });
  }, 10); // Reduced from 20ms to 10ms for faster response
}

// Update the UI with track information
function updateTrackInfo(trackData) {
  // Get the play and pause icon SVGs
  const playIcon = document.getElementById('play-icon');
  const pauseIcon = document.getElementById('pause-icon');
  
  if (!trackData || !trackData.item) {
    trackTitleElement.textContent = 'No track playing';
    artistNameElement.textContent = '';
    albumArtElement.src = 'https://via.placeholder.com/80';
    
    // Show play icon
    if (playIcon && pauseIcon) {
      playIcon.style.display = 'block';
      pauseIcon.style.display = 'none';
    }
    
    shuffleButton.classList.remove('active');
    repeatButton.classList.remove('active');
    shuffleButton.style.opacity = '0.5';
    repeatButton.style.opacity = '0.5';
    
    // Reset progress bar
    currentTrackDuration = 0;
    currentTrackProgress = 0;
    updateProgressBar(0, 1);
    
    // Reset time displays
    const currentTimeElem = document.getElementById('current-time');
    const totalTimeElem = document.getElementById('total-time');
    if (currentTimeElem) currentTimeElem.textContent = '0:00';
    if (totalTimeElem) totalTimeElem.textContent = '0:00';
    
    clearInterval(progressTimer);
    currentTrackId = null;
    
    updateWindowSize(); // Update window size after content changes
    return;
  }

  // Track change detection
  const trackChanged = currentTrackId !== trackData.item.id;
  currentTrackId = trackData.item.id;

  // Store the current Spotify track info globally so we can reference it
  // when making queue operations
  window.currentPlaybackContext = {
    context_uri: trackData.context?.uri,
    current_index: 0  // We'll try to get this from the API
  };

  if (trackData.context && trackData.item) {
    // Try to determine position in context if available
    const contextType = trackData.context.type;
    if (['album', 'playlist', 'artist'].includes(contextType)) {
      // For albums, playlists, and artist contexts, save relevant data
      window.currentPlaybackContext.context_type = contextType;
      
      // Some contexts provide index data
      if (typeof trackData.item.disc_number === 'number' && 
          typeof trackData.item.track_number === 'number') {
        window.currentPlaybackContext.current_index = trackData.item.track_number - 1;
      }
    }
  }

  const track = trackData.item;
  trackTitleElement.textContent = track.name;
  artistNameElement.textContent = track.artists.map(artist => artist.name).join(', ');
  albumArtElement.src = track.album.images[0]?.url || 'https://via.placeholder.com/80';
  
  // Toggle play/pause icon based on play state
  if (playIcon && pauseIcon) {
    if (trackData.is_playing) {
      playIcon.style.display = 'none';
      pauseIcon.style.display = 'block';
    } else {
      playIcon.style.display = 'block';
      pauseIcon.style.display = 'none';
    }
  }
  
  // Update shuffle and repeat button states
  if (trackData.shuffle_state) {
    shuffleButton.classList.add('active');
    shuffleButton.style.opacity = '1';
  } else {
    shuffleButton.classList.remove('active');
    shuffleButton.style.opacity = '0.5';
  }
  
  if (trackData.repeat_state !== 'off') {
    repeatButton.classList.add('active');
    repeatButton.style.opacity = '1';
  } else {
    repeatButton.classList.remove('active');
    repeatButton.style.opacity = '0.5';
  }
  
  // Update progress bar with data from Spotify
  currentTrackDuration = track.duration_ms || 0;
  currentTrackProgress = trackData.progress_ms || 0;
  updateProgressBar(currentTrackProgress, currentTrackDuration);
  
  // Start or update the progress timer
  startProgressTimer(trackData.is_playing);
  
  updateWindowSize(); // Update window size after content changes
}

// Create a track item for the queue or history
function createTrackItem(track, metadata, isQueue = true) {
  const trackItem = document.createElement('li');
  trackItem.className = 'track-item';
  
  // Add the track URI as a data attribute for reference
  trackItem.setAttribute('data-track-uri', track.uri);
  // Also set data-uri to match the attribute we're checking in updateHistory
  trackItem.setAttribute('data-uri', track.uri);
  
  // If this is a queue item, add queue index
  if (isQueue && metadata && typeof metadata.queueIndex === 'number') {
    // Store the queue index (0-based) as a data attribute
    trackItem.setAttribute('data-queue-index', metadata.queueIndex);
  }
  
  // Wrap the image in a container for the overlay
  const imgContainer = document.createElement('div');
  imgContainer.className = 'track-item-img-container';
  
  // Create album art
  const albumArt = document.createElement('img');
  const albumArtUrl = track.album?.images[0]?.url || 'https://via.placeholder.com/32';
  albumArt.src = albumArtUrl;
  albumArt.alt = 'Album Art';
  
  // Create play overlay
  const playOverlay = document.createElement('div');
  playOverlay.className = 'play-overlay';
  
  // Add play icon (using text for now, but could be replaced with an actual icon)
  const playIcon = document.createElement('i');
  playIcon.textContent = '▶';
  playOverlay.appendChild(playIcon);
  
  // Add the album art and overlay to the container
  imgContainer.appendChild(albumArt);
  imgContainer.appendChild(playOverlay);
  
  // Create info container
  const infoContainer = document.createElement('div');
  infoContainer.className = 'track-item-info';
  
  // Create title element
  const title = document.createElement('p');
  title.className = 'track-item-title';
  title.textContent = track.name;
  
  // Create artist element
  const artist = document.createElement('p');
  artist.className = 'track-item-artist';
  artist.textContent = track.artists.map(a => a.name).join(', ');
  
  // Assemble the components
  infoContainer.appendChild(title);
  infoContainer.appendChild(artist);
  
  trackItem.appendChild(imgContainer);
  trackItem.appendChild(infoContainer);
  
  // Add mouseenter/mouseleave events to track hover state more precisely
  trackItem.addEventListener('mouseenter', () => {
    // Prevent other updates from affecting this element while hovered
    isHoveringTrackItem = true;
    lastHoveredTrack = trackItem;
    
    // Use the CSS class for consistent styling
    trackItem.classList.add('track-item-hover');
  });
  
  trackItem.addEventListener('mouseleave', () => {
    isHoveringTrackItem = false;
    lastHoveredTrack = null;
    
    // Remove the hover class
    trackItem.classList.remove('track-item-hover');
  });
  
  // Add click event for the track item
  trackItem.addEventListener('click', async () => {
    try {
      // Display visual feedback that the click was registered
      trackItem.style.opacity = '0.7';
      
      if (isQueue) {
        // Capture the queue section element
        const queueSection = document.querySelector('.queue-section');
        
        // Don't reset the hover state, but store it
        const wasHovering = isHoveringTrackItem;
        const hoveredSection = lastHoveredTrack ? lastHoveredTrack.closest('.queue-section, .history-section') : null;
        const wasQueueHovered = hoveredSection && hoveredSection.classList.contains('queue-section');
        
        // Skip to this track in the queue
        await window.spotify.skipInQueue(track.uri);
        
        // Immediately fetch and update the queue, bypassing hover check
        setTimeout(async () => {
          try {
            const updatedQueueData = await window.spotify.getQueue();
            if (updatedQueueData) {
              // Force update by not adding skipCheck property
              updateQueue(updatedQueueData);
              
              // After the update, check if mouse is still over the queue section
              // This fixes the issue when user moves mouse away during update
              setTimeout(() => {
                // Get current mouse position
                const mouseX = window.mouseX || 0;
                const mouseY = window.mouseY || 0;
                
                // Get queue section bounds
                const rect = queueSection.getBoundingClientRect();
                const isMouseOverQueue = (
                  mouseX >= rect.left && 
                  mouseX <= rect.right && 
                  mouseY >= rect.top && 
                  mouseY <= rect.bottom
                );
                
                // If mouse is not over queue, simulate a mouseleave event
                if (!isMouseOverQueue) {
                  queueSection.classList.remove('expanded');
                  updateWindowSize();
                }
              }, 100);
              
              // If we were hovering over the queue section, make sure all tracks are visible
              if (wasQueueHovered) {
                queueSection.classList.add('expanded');
                
                // Force tracks to be visible with a slight delay to ensure DOM is updated
                setTimeout(() => {
                  const allTracks = document.querySelectorAll('#queue-list .track-item');
                  for (let i = 1; i < Math.min(allTracks.length, 4); i++) {
                    allTracks[i].style.display = 'flex';
                  }
                  
                  // Force a reflow to ensure the tracks render
                  void queueSection.offsetHeight;
                  
                  // Update window size to accommodate visible tracks
                  updateWindowSize();
                }, 50);
              }
            }
          } catch (err) {
            console.error('Failed to update queue after selection:', err);
          }
        }, 250); // Updated from 500ms to 250ms to match refresh rate
      } else {
        // Play this track from history - this path is no longer used since we removed history
        await window.spotify.playTrack(track.uri);
      }
      
      // Reset opacity after playing
      setTimeout(() => {
        trackItem.style.opacity = '1';
      }, 100); // Reduced from 200ms to 100ms
    } catch (error) {
      console.error('Error playing track', error);
      // Reset opacity on error
      trackItem.style.opacity = '1';
    }
  });
  
  return trackItem;
}

// Update queue list
function updateQueue(queueData) {
  console.log('Queue Data:', queueData);  // Log the queue data for debugging
  
  // Save current expanded state
  const queueSection = document.querySelector('.queue-section');
  const wasExpanded = queueSection && queueSection.classList.contains('expanded');
  
  // Check if mouse is actually over the queue section before proceeding
  const mouseX = window.mouseX || 0;
  const mouseY = window.mouseY || 0;
  const isMouseOverQueue = queueSection && (() => {
    const rect = queueSection.getBoundingClientRect();
    return (
      mouseX >= rect.left && 
      mouseX <= rect.right && 
      mouseY >= rect.top && 
      mouseY <= rect.bottom
    );
  })();
  
  // Skip update ONLY if hovering AND not forced update
  if (queueData.skipCheck && isHoveringTrackItem && lastHoveredTrack && lastHoveredTrack.closest('#queue-list')) {
    console.log('Skipping queue update while hovering');
    return;
  }
  
  // Check if we have valid queue data with upcoming tracks
  if (!queueData || !queueData.queue || queueData.queue.length === 0) {
    queueList.innerHTML = '<li class="track-item" style="opacity: 0.5; justify-content: center;">No songs in up next</li>';
    updateWindowSize(); // Update window size after content changes
    return;
  }

  // Clear the queue list
  queueList.innerHTML = '';
  
  // Limit to maximum 5 tracks
  const MAX_QUEUE_DISPLAY = 5;
  const tracksToDisplay = queueData.queue.slice(0, MAX_QUEUE_DISPLAY);
  
  // Display the tracks (limited to 5)
  tracksToDisplay.forEach((track, index) => {
    const trackItem = createTrackItem(track, { queueIndex: index }, true);
    queueList.appendChild(trackItem);
  });

  // If mouse is over the queue and it was previously expanded, maintain expanded state
  if (isMouseOverQueue && wasExpanded) {
    queueSection.classList.add('expanded');
    preResizeForExpansion('.queue-section .track-item:nth-child(n+2)');
  } else if (wasExpanded && !isMouseOverQueue) {
    queueSection.classList.remove('expanded');
    setTimeout(() => updateWindowSize(), 50);
  } else {
    updateWindowSize();
  }
  
  return true;
}

// Set up button click handlers with visual feedback
function addClickWithFeedback(button, action) {
  button.addEventListener('click', async () => {
    try {
      button.style.opacity = '0.5';
      await window.spotify[action]();
      const trackData = await window.spotify.getCurrentTrack();
      
      // Special handling for play/pause to ensure progress timer is updated properly
      if (action === 'playPause') {
        // Update progress bar and timer based on the new state
        if (trackData && trackData.item) {
          currentTrackProgress = trackData.progress_ms || 0;
          currentTrackDuration = trackData.item.duration_ms || 0;
          updateProgressBar(currentTrackProgress, currentTrackDuration);
          startProgressTimer(trackData.is_playing);
        }
      }
      
      updateTrackInfo(trackData);
    } catch (error) {
      console.error(`Failed to execute ${action}:`, error);
      trackTitleElement.textContent = 'Error: Make sure Spotify is active';
    } finally {
      setTimeout(() => {
        button.style.opacity = '1';
      }, 200);
    }
  });
}

// Add click handlers with feedback
addClickWithFeedback(playPauseButton, 'playPause');
addClickWithFeedback(prevButton, 'previousTrack');
addClickWithFeedback(nextButton, 'nextTrack');
addClickWithFeedback(shuffleButton, 'toggleShuffle');
addClickWithFeedback(repeatButton, 'toggleRepeat');

// Add click handler for the progress bar to enable seeking
const playbackContainer = document.querySelector('.playback-container');
if (playbackContainer) {
  playbackContainer.addEventListener('click', async (event) => {
    if (currentTrackDuration > 0) {
      // Calculate position based on click position
      const rect = playbackContainer.getBoundingClientRect();
      const clickPosition = (event.clientX - rect.left) / rect.width;
      const seekPosition = Math.floor(clickPosition * currentTrackDuration);
      
      try {
        // Update local state immediately for responsive UI
        currentTrackProgress = seekPosition;
        updateProgressBar(currentTrackProgress, currentTrackDuration);
        
        // Update time display immediately for better UX
        const currentTimeElem = document.getElementById('current-time');
        if (currentTimeElem) {
          currentTimeElem.textContent = formatTime(seekPosition);
        }
        
        // Call Spotify API to actually seek
        const trackData = await window.spotify.seekToPosition(seekPosition);
        
        // Update UI with the returned track data
        if (trackData) {
          updateTrackInfo(trackData);
        }
      } catch (error) {
        console.error('Failed to seek:', error);
      }
    }
  });
}

// Listen for updates from the main process
window.spotify.onTrackUpdate((event, trackData) => {
  updateTrackInfo(trackData);
});

window.spotify.onQueueUpdate((event, queueData) => {
  // Add skipCheck flag for routine updates to respect hover state
  // This flag allows the updateQueue function to skip updates when hovering
  // but direct calls (like from clicking a track) won't include this flag
  // and will force an update regardless of hover state
  const queueWithSkipCheck = { ...queueData, skipCheck: true };
  updateQueue(queueWithSkipCheck);
});

// Initial data requests with debug
console.log('Making initial data requests');

Promise.all([
  window.spotify.getCurrentTrack(),
  window.spotify.getQueue()
  // Removed getRecentlyPlayed from this list
]).then(([trackData, queueData]) => {
  console.log('Initial data received:');
  console.log(`- Track data: ${trackData ? 'yes' : 'no'}`);
  console.log(`- Queue data: ${queueData ? 'yes' : 'no'}, items: ${queueData?.queue?.length || 0}`);
  
  updateTrackInfo(trackData);
  updateQueue(queueData);
  // Removed updateHistory call
}).catch(error => {
  console.error('Failed to get initial data:', error);
  trackTitleElement.textContent = 'Error: Make sure Spotify is active';
});

// Add event listeners to queue and history sections to preemptively resize
document.addEventListener('DOMContentLoaded', () => {
  // Set up event listeners once DOM is loaded
  const queueSection = document.querySelector('.queue-section');
  // Removed historySection variable
  
  // Variables to track hover timers
  let queueHoverTimer = null;
  // Removed historyHoverTimer
  const HOVER_DELAY = 300; // 300ms delay before expanding
  
  if (queueSection) {
    const queueProgressLine = document.getElementById('queue-progress-line');
    
    queueSection.addEventListener('mouseenter', () => {
      // Start the progress line animation immediately
      if (queueProgressLine) {
        queueProgressLine.classList.add('active');
      }
      
      // Clear any existing timer
      if (queueHoverTimer) clearTimeout(queueHoverTimer);
      
      // Set a delay before expanding the section
      queueHoverTimer = setTimeout(() => {
        queueSection.classList.add('expanded');
        preResizeForExpansion('.queue-section .track-item:nth-child(n+2)');
      }, HOVER_DELAY);
    });
    
    queueSection.addEventListener('mouseleave', () => {
      // Clear timer if mouse leaves before delay completes
      if (queueHoverTimer) clearTimeout(queueHoverTimer);
      queueHoverTimer = null;
      
      // Hide the progress line
      if (queueProgressLine) {
        queueProgressLine.classList.remove('active');
      }
      
      queueSection.classList.remove('expanded');
      // Update window size after panel collapses
      setTimeout(() => updateWindowSize(), 50);
    });
  }
  
  // Removed history section event listeners
}); 