let deferredPrompt;
const installDialog = document.getElementById('installDialog');
const installBtn = document.getElementById('installBtn');
const closeBtn = document.getElementById('closeBtn');

// Listen for the 'beforeinstallprompt' event
window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event; // Store the event for later use

    // Show the install dialog
    installDialog.style.display = 'block';
});

// Handle the install button click
installBtn.addEventListener('click', () => {
    if (deferredPrompt) {
        // Show the PWA installation prompt
        deferredPrompt.prompt();

        // Wait for the user's response
        deferredPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') {
                console.log('User accepted the PWA installation');
            } else {
                console.log('User dismissed the PWA installation');
            }
            deferredPrompt = null; // Clear the prompt
        });
    }

    // Hide the dialog
    installDialog.style.display = 'none';
});

// Handle the close button click
closeBtn.addEventListener('click', () => {
    installDialog.style.display = 'none';
});
