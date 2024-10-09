let deferredPrompt;

// Listen for the 'beforeinstallprompt' event and save it
window.addEventListener('beforeinstallprompt', (e) => {
  // Prevent the mini-infobar from appearing on mobile
  e.preventDefault();

  // Store the event so it can be triggered later
  deferredPrompt = e;

  // Enable the install button once the prompt event is available
  const installButton = document.getElementById('install-pwa-button');
  if (installButton) {
    installButton.style.display = 'inline-block';
    
    // Add a click event listener to the install button
    installButton.addEventListener('click', () => {
      // Hide the button after it’s clicked
      installButton.style.display = 'none';
      
      // Show the installation prompt
      deferredPrompt.prompt();
      
      // Wait for the user's decision
      deferredPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === 'accepted') {
          console.log('User accepted the install prompt');
        } else {
          console.log('User dismissed the install prompt');
        }
        deferredPrompt = null;  // Clear the deferred prompt
      });
    });
  }
});

// Optional: Check if the app is already installed and hide the button
window.addEventListener('appinstalled', () => {
  console.log('PWA has been installed');
  const installButton = document.getElementById('install-pwa-button');
  if (installButton) {
    installButton.style.display = 'none';
  }
});
