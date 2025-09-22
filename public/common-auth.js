// Requires firebase-app-compat.js and firebase-auth-compat.js to be loaded first
(function () {
  if (typeof firebase === 'undefined') {
    return; // Firebase SDK not present; do nothing
  }

  var firebaseConfig = {
    apiKey: "AIzaSyDY2gf5I7kJQ7iXD8F6U2BrEMCYjfnFQxk",
    authDomain: "ptjobboard2024.firebaseapp.com",
    databaseURL: "https://ptjobboard2024-default-rtdb.firebaseio.com",
    projectId: "ptjobboard2024",
    storageBucket: "ptjobboard2024.firebasestorage.app",
    messagingSenderId: "401143229772",
    appId: "1:401143229772:web:b5b14d89a89d75443df3e9",
    measurementId: "G-PF9F78SKZV"
  };

  try {
    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }
  } catch (e) {}

  var auth = firebase.auth && firebase.auth();
  if (!auth) return;

  auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(function () {});

  var containerId = 'top-right-auth-controls';
  function ensureContainer() {
    var existing = document.getElementById(containerId);
    if (existing) return existing;
    var container = document.createElement('div');
    container.id = containerId;
    container.style.position = 'fixed';
    container.style.top = '16px';
    container.style.right = '16px';
    container.style.display = 'none';
    container.style.gap = '8px';
    container.style.zIndex = '9999';
    document.body.appendChild(container);
    return container;
  }

  function renderForUser(user) {
    var container = ensureContainer();
    container.innerHTML = '';
    if (!user) {
      container.style.display = 'none';
      return;
    }
    container.style.display = 'flex';
    // Profile link
    var profileLink = document.createElement('a');
    profileLink.href = 'user.html';
    profileLink.textContent = 'User Info';
    profileLink.style.padding = '8px 12px';
    profileLink.style.background = '#f0f4ff';
    profileLink.style.color = '#1a57d6';
    profileLink.style.textDecoration = 'none';
    profileLink.style.border = '1px solid #c7d2fe';
    profileLink.style.borderRadius = '6px';
    profileLink.style.fontFamily = 'Arial, sans-serif';
    profileLink.style.fontWeight = 'bold';

    // Logout button
    var btn = document.createElement('button');
    btn.textContent = 'Logout';
    btn.style.padding = '8px 12px';
    btn.style.background = '#ef4444';
    btn.style.color = '#fff';
    btn.style.border = 'none';
    btn.style.borderRadius = '6px';
    btn.style.cursor = 'pointer';
    btn.style.fontFamily = 'Arial, sans-serif';
    btn.onclick = function () {
      auth.signOut().then(function () {
        window.location.href = 'index.html';
      });
    };

    container.appendChild(profileLink);
    container.appendChild(btn);
  }

  auth.onAuthStateChanged(renderForUser);
})();


