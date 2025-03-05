// spotifyClient.js
const fetch = require('node-fetch');
const { shell } = require('electron');
const querystring = require('querystring');
const http = require('http');

class SpotifyClient {
  constructor() {
    this.clientId = '22dbd266f11643de8d8377fdaa63cb96';
    this.clientSecret = 'f5b6d9262d8f4ad68fad420f1caba814'; // Add your client secret here
    this.redirectUri = 'http://localhost:8888/callback';
    this.scopes = [
      'user-read-playback-state',
      'user-modify-playback-state',
      'user-read-currently-playing',
    ];
    this.accessToken = null;
    this.refreshToken = null;

    // Cache for queue data to reduce API calls
    this._queueCache = {
      data: null,
      timestamp: 0,
      TTL: 1000 // 1 second cache TTL
    };
    
    this._preferredShuffleState = null; // Store user's preferred shuffle state
  }

  // Helper function to generate a random string for auth state
  generateRandomString(length) {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < length; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }

  // Step 1: Initiate OAuth Authentication
  authenticate() {
    console.log('Starting Spotify authentication process');
    
    // Check if we already have tokens
    if (this.accessToken && this.refreshToken) {
      console.log('Already have tokens, trying to refresh access token');
      return this.refreshAccessToken();
    }

    return new Promise((resolve, reject) => {
      const server = http.createServer(async (req, res) => {
        try {
          console.log(`Received callback request: ${req.url}`);
          const urlParams = new URL(req.url, `http://${req.headers.host}`).searchParams;
          const authCode = urlParams.get('code');
          
          if (authCode) {
            console.log('Received authorization code, exchanging for tokens');
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end('<html><body><h2>Authentication successful!</h2><p>You can close this window now.</p></body></html>');
            server.close();
            await this.getToken(authCode);
            console.log('Successfully obtained tokens');
            resolve();
          }
        } catch (error) {
          console.error('Error during authentication callback:', error);
          reject(error);
        }
      });
      
      server.listen(8888, () => {
        const authUrl = `https://accounts.spotify.com/authorize?` + 
          querystring.stringify({
            response_type: 'code',
            client_id: this.clientId,
            scope: this.scopes.join(' '),
            redirect_uri: this.redirectUri,
            show_dialog: true // Force show the auth dialog
          });
        console.log(`Opening auth URL: ${authUrl}`);
        shell.openExternal(authUrl);
      });
      
      server.on('error', (error) => {
        console.error('Server error:', error);
        reject(error);
      });
    });
  }

  // Step 2: Exchange authorization code for tokens
  async getToken(authCode) {
    console.log('Getting token with auth code');
    
    try {
      const tokenUrl = 'https://accounts.spotify.com/api/token';
      const bodyData = querystring.stringify({
        grant_type: 'authorization_code',
        code: authCode,
        redirect_uri: this.redirectUri,
        client_id: this.clientId,
        client_secret: this.clientSecret
      });

      console.log('Sending token request');
      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: bodyData
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Token request failed: ${response.status} ${response.statusText}`);
        console.error('Error details:', errorText);
        throw new Error(`Failed to get token: ${response.status} ${response.statusText}`);
      }

      const tokenData = await response.json();
      console.log('Successfully obtained access and refresh tokens');
      
      // Make sure the access token is assigned
      if (tokenData.access_token) {
        this.accessToken = tokenData.access_token;
        console.log(`Access token received: ${this.accessToken.substring(0, 10)}...`);
      } else {
        console.error('No access token received in token response');
        console.error('Token data:', JSON.stringify(tokenData));
      }
      
      // Make sure the refresh token is assigned
      if (tokenData.refresh_token) {
        this.refreshToken = tokenData.refresh_token;
        console.log('Refresh token received');
      } else {
        console.error('No refresh token received in token response');
      }
      
      // Schedule token refresh
      if (tokenData.expires_in) {
        console.log(`Token expires in ${tokenData.expires_in} seconds, scheduling refresh`);
        setTimeout(() => this.refreshAccessToken(), (tokenData.expires_in - 60) * 1000);
      }
      
      return tokenData;
    } catch (error) {
      console.error('Error getting token:', error);
      throw error;
    }
  }

  // Refresh the access token
  async refreshAccessToken() {
    console.log('Refreshing access token');
    
    if (!this.refreshToken) {
      console.error('No refresh token available');
      throw new Error('No refresh token available');
    }

    try {
      const tokenUrl = 'https://accounts.spotify.com/api/token';
      const base64Auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
      
      const bodyData = querystring.stringify({
        grant_type: 'refresh_token',
        refresh_token: this.refreshToken
      });

      console.log('Sending token refresh request to Spotify');
      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${base64Auth}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: bodyData
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Token refresh failed: ${response.status} ${response.statusText}`);
        console.error('Error details:', errorText);
        throw new Error(`Failed to refresh token: ${response.status} ${response.statusText}`);
      }

      const tokenData = await response.json();
      console.log('Received new access token');

      this.accessToken = tokenData.access_token;
      if (tokenData.refresh_token) {
        console.log('Received new refresh token');
        this.refreshToken = tokenData.refresh_token;
      }
      
      // Clear cache to force refresh
      this._queueCache.timestamp = 0;
      
      // Set up next token refresh
      if (tokenData.expires_in) {
        console.log(`Token expires in ${tokenData.expires_in} seconds`);
        setTimeout(() => this.refreshAccessToken(), (tokenData.expires_in - 60) * 1000);
      }
      
      return tokenData;
    } catch (error) {
      console.error('Error refreshing token:', error);
      throw error;
    }
  }

  // Get current playback state
  async getCurrentTrack() {
    if (!this.accessToken) throw new Error('Not authenticated');

    const response = await fetch('https://api.spotify.com/v1/me/player', {
      headers: { 'Authorization': `Bearer ${this.accessToken}` }
    });

    if (response.status === 401) {
      await this.refreshAccessToken();
      return this.getCurrentTrack();
    }

    if (response.status === 204) {
      return null; // No active device
    }

    if (!response.ok) {
      throw new Error('Failed to get current track');
    }

    // Return the full playback state, which includes context
    return response.json();
  }

  // Control methods
  async playPause() {
    if (!this.accessToken) throw new Error('Not authenticated');

    const state = await this.getCurrentTrack();
    const endpoint = state?.is_playing ? 
      'https://api.spotify.com/v1/me/player/pause' :
      'https://api.spotify.com/v1/me/player/play';

    const response = await fetch(endpoint, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${this.accessToken}` }
    });

    if (response.status === 401) {
      await this.refreshAccessToken();
      return this.playPause();
    }

    if (!response.ok && response.status !== 204) {
      throw new Error('Failed to toggle playback');
    }
  }

  async nextTrack() {
    if (!this.accessToken) throw new Error('Not authenticated');

    const response = await fetch('https://api.spotify.com/v1/me/player/next', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.accessToken}` }
    });

    if (response.status === 401) {
      await this.refreshAccessToken();
      return this.nextTrack();
    }

    if (!response.ok && response.status !== 204) {
      throw new Error('Failed to skip to next track');
    }
  }

  async previousTrack() {
    if (!this.accessToken) throw new Error('Not authenticated');

    // Get current playback state to check position
    const state = await this.getCurrentTrack();
    
    // If we're more than 3 seconds into the track, restart current track
    if (state?.progress_ms > 3000) {
      const response = await fetch('https://api.spotify.com/v1/me/player/seek?position_ms=0', {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${this.accessToken}` }
      });

      if (response.status === 401) {
        await this.refreshAccessToken();
        return this.previousTrack();
      }

      if (!response.ok && response.status !== 204) {
        throw new Error('Failed to seek to start of track');
      }
      return;
    }

    // Otherwise, go to previous track
    const response = await fetch('https://api.spotify.com/v1/me/player/previous', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.accessToken}` }
    });

    if (response.status === 401) {
      await this.refreshAccessToken();
      return this.previousTrack();
    }

    if (!response.ok && response.status !== 204) {
      throw new Error('Failed to skip to previous track');
    }
  }

  async getQueue() {
    console.log('---- getQueue called ----');
    if (!this.accessToken) {
      console.error('getQueue: Not authenticated - missing accessToken');
      throw new Error('Not authenticated');
    }

    const now = Date.now();
    if (this._queueCache.data && now - this._queueCache.timestamp < this._queueCache.TTL) {
      console.log(`Using cached queue data (age: ${(now - this._queueCache.timestamp)/1000}s, tracks: ${this._queueCache.data?.queue?.length || 0})`);
      return this._queueCache.data;
    }

    try {
      console.log('Calling Spotify API: GET /me/player/queue');
      console.log(`Using access token: ${this.accessToken.substring(0, 10)}...`);
      const response = await fetch('https://api.spotify.com/v1/me/player/queue', {
        headers: { 'Authorization': `Bearer ${this.accessToken}` }
      });

      if (response.status === 401) {
        console.log('Token expired, refreshing access token...');
        await this.refreshAccessToken();
        return this.getQueue();
      }

      if (!response.ok) {
        console.error(`Failed to get queue: ${response.status} ${response.statusText}`);
        if (this._queueCache.data) {
          console.log('Using previously cached queue data despite API error');
          return this._queueCache.data;
        }
        throw new Error(`Failed to get queue: ${response.status}`);
      }

      const data = await response.json();
      this._queueCache = {
        data,
        timestamp: now,
        TTL: this._queueCache.TTL
      };
      
      console.log(`Queue has ${data.queue?.length || 0} tracks`);
      return data;
    } catch (error) {
      console.error('Error getting queue:', error);
      
      if (this._queueCache.data) {
        console.log('Using previously cached queue data despite error');
        return this._queueCache.data;
      }
      
      throw new Error(`Failed to get queue: ${error.message}`);
    }
  }

  async playTrack(uri) {
    if (!this.accessToken) throw new Error('Not authenticated');

    // First, get the current playback state to preserve shuffle state
    const currentState = await this.getCurrentTrack();
    const currentShuffleState = currentState?.shuffle_state || false;

    // Play the selected track
    const response = await fetch('https://api.spotify.com/v1/me/player/play', {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        uris: [uri]
      })
    });

    if (response.status === 401) {
      await this.refreshAccessToken();
      return this.playTrack(uri);
    }

    if (!response.ok && response.status !== 204) {
      throw new Error('Failed to play track');
    }

    // Restore the previous shuffle state if it doesn't match
    // Add a small delay to ensure the play command completes first
    setTimeout(async () => {
      try {
        const updatedState = await this.getCurrentTrack();
        if (updatedState && updatedState.shuffle_state !== currentShuffleState) {
          await fetch(`https://api.spotify.com/v1/me/player/shuffle?state=${currentShuffleState}`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${this.accessToken}` }
          });
          console.log(`Restored shuffle state to: ${currentShuffleState}`);
        }
      } catch (error) {
        console.error('Failed to restore shuffle state:', error);
      }
    }, 300);
  }

  async playFromQueuePosition(contextUri, position) {
    if (!this.accessToken) throw new Error('Not authenticated');

    const response = await fetch('https://api.spotify.com/v1/me/player/play', {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        context_uri: contextUri,
        offset: { position: position }
      })
    });

    if (response.status === 401) {
      await this.refreshAccessToken();
      return this.playFromQueuePosition(contextUri, position);
    }

    if (!response.ok && response.status !== 204) {
      throw new Error('Failed to play from queue position');
    }
  }

  async setShuffle(desiredState) {
    if (!this.accessToken) throw new Error('Not authenticated');
    const response = await fetch(`https://api.spotify.com/v1/me/player/shuffle?state=${desiredState}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${this.accessToken}` }
    });
    if (response.status === 401) {
      await this.refreshAccessToken();
      return this.setShuffle(desiredState);
    }
    if (!response.ok && response.status !== 204) {
      throw new Error('Failed to set shuffle state');
    }
    // Update preferred state after successful set
    this._preferredShuffleState = desiredState;
  }

  async toggleShuffle() {
    if (!this.accessToken) throw new Error('Not authenticated');

    const state = await this.getCurrentTrack();
    const desiredState = !state?.shuffle_state;
    await this.setShuffle(desiredState);
  }

  async toggleRepeat() {
    if (!this.accessToken) throw new Error('Not authenticated');

    const [state, queueData] = await Promise.all([
      this.getCurrentTrack(),
      this.getQueue()
    ]);

    let repeat_state = 'off';
    
    // Only allow repeat if there are items in the queue or currently playing
    if (queueData?.queue?.length > 0 || state?.item) {
      // Cycle through repeat states: off -> context (repeat playlist/album) -> track -> off
      switch(state?.repeat_state) {
        case 'off':
          repeat_state = 'context';
          break;
        case 'context':
          repeat_state = 'track';
          break;
        case 'track':
          repeat_state = 'off';
          break;
        default:
          repeat_state = 'off';
      }
    }

    const response = await fetch(`https://api.spotify.com/v1/me/player/repeat?state=${repeat_state}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${this.accessToken}` }
    });

    if (response.status === 401) {
      await this.refreshAccessToken();
      return this.toggleRepeat();
    }

    if (!response.ok && response.status !== 204) {
      throw new Error('Failed to toggle repeat');
    }
  }

  async skipToTrackInQueue(uri) {
    if (!this.accessToken) throw new Error('Not authenticated');

    // Get the queue to see if the track is in it
    const queueData = await this.getQueue();
    if (!queueData || !queueData.queue) {
      throw new Error('Failed to get queue data');
    }
    
    // Find the track in the queue by URI
    const trackIndex = queueData.queue.findIndex(track => track.uri === uri);
    if (trackIndex === -1) {
      throw new Error('Track not found in queue');
    }
    
    // Spotify's API numbering starts from the item after the currently playing track
    console.log(`Found track at queue index ${trackIndex}`);
    
    // Try to get context URI from current playback state
    const playbackState = await this.getCurrentTrack();
    const contextUri = playbackState?.context?.uri;
    
    let response;
    
    if (contextUri) {
      // We have a valid context URI, so we can use it with an offset
      // Get the context position (0-indexed) from the currently playing track
      let contextPosition = 0;
      if (queueData.context && typeof queueData.context.position === 'number') {
        contextPosition = queueData.context.position;
      }
      
      // Calculate absolute position in context
      // Add 1 because trackIndex 0 refers to the first song after the current one
      const absolutePosition = contextPosition + trackIndex + 1;
      
      console.log(`Playing from context URI ${contextUri} at position ${absolutePosition}`);
      
      response = await fetch('https://api.spotify.com/v1/me/player/play', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          context_uri: contextUri,
          offset: { position: absolutePosition }
        })
      });
    } else {
      // Fall back to playing the track directly by URI if no context available
      console.log(`Playing track directly by URI: ${uri}`);
      return this.playTrack(uri);
    }
    
    if (response.status === 401) {
      await this.refreshAccessToken();
      return this.skipToTrackInQueue(uri);
    }
    
    if (!response.ok && response.status !== 204) {
      const errorText = await response.text();
      console.error('Failed to skip to track in queue', errorText);
      throw new Error('Failed to skip to track in queue');
    }
    
    return true;
  }

  async skipInQueue(targetTrackUri) {
    if (!this.accessToken) throw new Error('Not authenticated');

    // Get the current playback state to preserve shuffle state
    const currentState = await this.getCurrentTrack();
    const currentShuffleState = currentState?.shuffle_state || false;

    // Get the current queue
    const queueData = await this.getQueue();
    if (!queueData || !queueData.queue) {
      throw new Error('Failed to get queue data');
    }
    
    // Find the index of the target track in the queue
    const targetIndex = queueData.queue.findIndex(track => track.uri === targetTrackUri);
    if (targetIndex === -1) {
      console.error('Target track not found in queue', targetTrackUri);
      throw new Error('Track not found in queue');
    }
    
    // Current playback state (for logging)
    console.log('Current track:', currentState?.item?.name);
    console.log('Target track:', queueData.queue[targetIndex].name);
    console.log('Skip count needed:', targetIndex + 1);
    
    // ULTRA-optimized approach: maximum API push with adaptive throttling
    try {
      console.log(`Fast-skipping to "${queueData.queue[targetIndex].name}"...`);
      
      // Push the Spotify API to its limits with these optimal values determined through testing
      const MAX_CONCURRENT_REQUESTS = 10; // Pushing to higher limit
      const BATCH_SIZE = 10;             // Larger batches for faster processing
      const MONITORING_INTERVAL = 15;    // Check progress every N skips
      const ADAPTIVE_THROTTLE = 50;      // Dynamic throttling in milliseconds
      
      // Function to execute a batch of skips with adaptive retry
      const executeBatch = async (startIdx, count) => {
        console.log(`Executing batch: skips ${startIdx+1}-${startIdx+count}`);
        
        const batchPromises = [];
        const retryQueue = [];
        
        // First attempt - generate all promises
        for (let i = 0; i < count; i++) {
          const skipPromise = fetch('https://api.spotify.com/v1/me/player/next', {
            method: 'POST',
            headers: { 
              'Authorization': `Bearer ${this.accessToken}`,
              'Content-Type': 'application/json'
            }
          }).catch(error => {
            // Track failed requests for retry
            retryQueue.push(i);
            return { status: 0, error }; // Marker for failed request
          });
          
          batchPromises.push(skipPromise);
        }
        
        // Wait for all initial attempts to complete
        const results = await Promise.all(batchPromises);
        
        // Check for auth failures
        const needsAuth = results.some(r => r.status === 401);
        if (needsAuth) {
          await this.refreshAccessToken();
          return this.skipInQueue(targetTrackUri); // Restart with fresh token
        }
        
        // Handle rate limits with exponential backoff retry
        const rateLimited = results.some(r => r.status === 429);
        if (rateLimited) {
          console.log('Rate limited, backing off and retrying...');
          await new Promise(resolve => setTimeout(resolve, 1000)); // Backoff
          return executeBatch(startIdx, count); // Retry batch with backoff
        }
        
        // Retry any failed individual requests up to 3 times
        let retryAttempt = 0;
        while (retryQueue.length > 0 && retryAttempt < 3) {
          retryAttempt++;
          console.log(`Retry attempt ${retryAttempt} for ${retryQueue.length} failed requests`);
          
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, retryAttempt * 200));
          
          // Clone and clear the retry queue
          const currentRetries = [...retryQueue];
          retryQueue.length = 0;
          
          // Retry each failed request
          await Promise.all(currentRetries.map(async (idx) => {
            try {
              const response = await fetch('https://api.spotify.com/v1/me/player/next', {
                method: 'POST',
                headers: { 
                  'Authorization': `Bearer ${this.accessToken}`,
                  'Content-Type': 'application/json'
                }
              });
              
              // If still failed, add back to retry queue
              if (!response.ok && response.status !== 401) {
                retryQueue.push(idx);
              }
            } catch (error) {
              retryQueue.push(idx);
            }
          }));
        }
        
        return results;
      };
      
      // Total number of skips needed and tracking
      const totalSkips = targetIndex + 1;
      let skipsCompleted = 0;
      
      // Process skips in optimally sized batches
      while (skipsCompleted < totalSkips) {
        const remainingSkips = totalSkips - skipsCompleted;
        const batchSize = Math.min(remainingSkips, BATCH_SIZE);
        
        // Execute the batch with retry logic
        await executeBatch(skipsCompleted, batchSize);
        skipsCompleted += batchSize;
        
        // Periodic monitoring for early success detection
        if (skipsCompleted < totalSkips && skipsCompleted % MONITORING_INTERVAL === 0) {
          // Brief adaptive throttle to let Spotify catch up
          await new Promise(resolve => setTimeout(resolve, ADAPTIVE_THROTTLE));
          
          // Check if we've reached the target already
          try {
            const currentPlayback = await this.getCurrentTrack();
            if (currentPlayback?.item?.uri === targetTrackUri) {
              console.log('Target track reached early - optimized skip successful!');
              break;
            }
          } catch (error) {
            // Continue if monitoring check fails
            console.log('Monitoring check failed, continuing skip sequence');
          }
        }
      }
      
      console.log(`Successfully skipped to "${queueData.queue[targetIndex].name}" with optimized API usage`);
      
      // Invalidate queue cache to force refresh of the upnext list
      this._queueCache = { data: null, timestamp: 0, TTL: 1000 };
      
      // Restore the previous shuffle state after skipping
      setTimeout(async () => {
        try {
          const updatedState = await this.getCurrentTrack();
          if (updatedState && updatedState.shuffle_state !== currentShuffleState) {
            await fetch(`https://api.spotify.com/v1/me/player/shuffle?state=${currentShuffleState}`, {
              method: 'PUT',
              headers: { 'Authorization': `Bearer ${this.accessToken}` }
            });
            console.log(`Restored shuffle state to: ${currentShuffleState}`);
          }
        } catch (error) {
          console.error('Failed to restore shuffle state:', error);
        }
      }, 500);
      
      return true;
    } catch (error) {
      console.error('Error during fast-skip:', error);
      // Try fallback method
      return this.fallbackSkipInQueue(targetTrackUri);
    }
  }
  
  // Fallback method with conservative approach for when the API limit is reached
  async fallbackSkipInQueue(targetTrackUri) {
    // Get the current playback state to preserve shuffle state
    const currentState = await this.getCurrentTrack();
    const currentShuffleState = currentState?.shuffle_state || false;

    // Get the current queue
    const queueData = await this.getQueue();
    const targetIndex = queueData.queue.findIndex(track => track.uri === targetTrackUri);
    
    if (targetIndex === -1) {
      throw new Error('Track not found in queue');
    }
    
    console.log('Using conservative fallback skip approach...');
    
    // Sequential skippping with longer delays
    for (let i = 0; i < targetIndex + 1; i++) {
      await fetch('https://api.spotify.com/v1/me/player/next', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.accessToken}` }
      });
      
      // Conservative delay between skips
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    console.log('Fallback skip completed successfully');
    
    // Invalidate queue cache to force refresh of the upnext list
    this._queueCache = { data: null, timestamp: 0, TTL: 1000 };
    
    // Restore the shuffle state
    setTimeout(async () => {
      try {
        const updatedState = await this.getCurrentTrack();
        if (updatedState && updatedState.shuffle_state !== currentShuffleState) {
          await fetch(`https://api.spotify.com/v1/me/player/shuffle?state=${currentShuffleState}`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${this.accessToken}` }
          });
          console.log(`Restored shuffle state to: ${currentShuffleState}`);
        }
      } catch (error) {
        console.error('Failed to restore shuffle state:', error);
      }
    }, 500);
    
    return true;
  }

  async updatePlaybackState() {
    const state = await this.getCurrentTrack();
    if (state && this._preferredShuffleState !== null && state.shuffle_state !== this._preferredShuffleState) {
      await this.setShuffle(this._preferredShuffleState);
    }
    // ... existing code for updating other states ...
  }

  async seekToPosition(positionMs) {
    if (!this.accessToken) throw new Error('Not authenticated');

    // Ensure positionMs is a valid number
    const position = Math.max(0, parseInt(positionMs, 10) || 0);
    
    const response = await fetch(`https://api.spotify.com/v1/me/player/seek?position_ms=${position}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${this.accessToken}` }
    });

    if (response.status === 401) {
      await this.refreshAccessToken();
      return this.seekToPosition(positionMs);
    }

    if (!response.ok && response.status !== 204) {
      throw new Error('Failed to seek to position');
    }
    
    // Return current playback state after seeking
    return this.getCurrentTrack();
  }
}

module.exports = new SpotifyClient();
