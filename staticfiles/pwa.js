let deferredPrompt;

// Function to check if the app is already installed
function checkIfInstalled() {
  // Use matchMedia to check if the app is in standalone mode (PWA is installed)
  if (window.matchMedia('(display-mode: standalone)').matches) {
    console.log('PWA is already installed');
    hideInstallButton(); // Hide the button if installed
  }
}

// Function to hide the install button
function hideInstallButton() {
  const installButton = document.getElementById('install-pwa-button');
  if (installButton) {
    installButton.style.display = 'none';
  }
}

// Function to handle the 'beforeinstallprompt' event
function handleBeforeInstallPrompt(e) {
  // Prevent the mini-infobar from appearing
  e.preventDefault();

  // Store the event so it can be triggered later
  deferredPrompt = e;

  // Show the install button if the app is not installed
  const installButton = document.getElementById('install-pwa-button');
  if (installButton && !window.matchMedia('(display-mode: standalone)').matches) {
    installButton.style.display = 'inline-block';

    // Add a click event listener to trigger the install prompt
    installButton.addEventListener('click', () => {
      // Hide the button after it's clicked
      installButton.style.display = 'none';

      // Show the install prompt
      deferredPrompt.prompt();

      // Handle the user's response
      deferredPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === 'accepted') {
          console.log('User accepted the install prompt');
        } else {
          console.log('User dismissed the install prompt');
        }
        deferredPrompt = null; // Clear the prompt
      });
    });

    // Hide the install button after 10 seconds
    setTimeout(() => {
      hideInstallButton();
    }, 10000); // 10 seconds in milliseconds
  }
}

// Listen for the 'appinstalled' event and hide the button when PWA is installed
window.addEventListener('appinstalled', () => {
  console.log('PWA was installed');
  hideInstallButton();
});

// Wait for the DOM to fully load before attaching event listeners
window.addEventListener('DOMContentLoaded', () => {
  // Listen for the 'beforeinstallprompt' event
  window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

  // Check if the app is already installed when the page loads
  checkIfInstalled();
});
