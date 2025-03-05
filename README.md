# Spotifly
![image](https://github.com/user-attachments/assets/17ee7f2b-98bb-4072-82c5-137a79394809)
https://github.com/AlexWasTakenWasTaken/spotifly/blob/main/spotifly-demo-gif.gif

<h2>Overview</h2>
  <p>
    <strong>Spotifly</strong> is a <em>cross-platform overlay</em> that provides real-time updates on your Spotify playback. By integrating <strong>OAuth authentication</strong> with the advanced Spotify Web API, it offers a seamless and dynamic display of current track information, playback progress, and upcoming queue details directly on your desktop.
  </p>
  
  <h2>Features</h2>
  <ul>
    <li><strong>Cross-Platform Overlay:</strong> Built with Electron and Node.js to work on multiple operating systems.</li>
    <li><strong>Secure Authentication:</strong> Utilizes OAuth for secure, reliable connection with Spotify.</li>
    <li><strong>Real-Time Playback Monitoring:</strong> High-frequency API updates ensure the overlay stays in sync with your Spotify player.</li>
    <li><strong>Responsive UI:</strong> Implements debounced window resizing for a smooth user experience.</li>
    <li><strong>Optimized API Management:</strong> Features strategic caching and adaptive rate limiting to handle rapid API calls efficiently.</li>
  </ul>
  
  <h2>Installation</h2>
  <ol>
    <li>
      <strong>Clone the Repository:</strong>
      <pre><code>git clone https://github.com/your-username/spotifly.git
cd spotifly</code></pre>
    </li>
    <li>
      <strong>Install Dependencies:</strong>
      <pre><code>npm install</code></pre>
    </li>
    <li>
      <strong>Run the Application:</strong>
      <pre><code>npm start</code></pre>
    </li>
  </ol>
  
  <h2>Configuration</h2>
  <p>
    <strong>Spotify Credentials:</strong> Update your Spotify client credentials in <code>spotifyClient.js</code> with your own client ID and client secret obtained from your Spotify Developer Dashboard.
  </p>
  <p>
    <strong>Customization:</strong> Tweak the overlay styling by modifying <code>index.html</code> and <code>renderer.js</code> to match your preferences.
  </p>
  
  <h2>Usage</h2>
  <p>
    After launching the application, you will be prompted to authenticate with your Spotify account. Once connected, the overlay displays:
  </p>
  <ul>
    <li><strong>Current Track Details:</strong> Including album art, track title, artist, and playback progress.</li>
    <li><strong>Playback Controls:</strong> Manage play/pause, skip tracks, toggle shuffle, and repeat.</li>
    <li><strong>Queue Management:</strong> View the upcoming tracks in your Spotify queue.</li>
  </ul>
  
  <h2>Contributing</h2>
  <p>
    Contributions are welcome! If you'd like to improve Spotifly or report an issue, please:
  </p>
  <ol>
    <li>Fork the repository.</li>
    <li>Create a feature branch.</li>
    <li>Commit your changes and open a pull request.</li>
  </ol>
  
  <h2>License</h2>
  <p>
    Spotifly is released under the <strong>MIT License</strong>. See the <a href="LICENSE">LICENSE</a> file for more details.
  </p>
