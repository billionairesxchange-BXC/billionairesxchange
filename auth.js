import { getApp, getApps, initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { doc, getDoc, getFirestore, updateDoc } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyAWX1q9Up79p8A7kEWtfofDDmq4WWJDh4c',
  authDomain: 'billionairesxchange-e8162.firebaseapp.com',
  projectId: 'billionairesxchange-e8162',
  storageBucket: 'billionairesxchange-e8162.firebasestorage.app',
  messagingSenderId: '872942229296',
  appId: '1:872942229296:web:49af2cd9798dc1c0dfdaf5',
  measurementId: 'G-JCZ6FCKF3M'
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
window.makingsGetIdToken = async () => auth.currentUser ? auth.currentUser.getIdToken() : null;
const navActions = document.querySelector('.nav-actions');

function addLink(label, href, className) {
  const link = document.createElement('a');
  link.className = className;
  link.href = href;
  link.textContent = label;
  navActions.appendChild(link);
}

function renderSignedOut() {
  navActions.replaceChildren();
  addLink('Login', 'verification.html#login', 'btn btn-ghost');
  addLink('Sign Up', 'verification.html#signup', 'btn btn-primary');
}

function renderSignedIn(firebaseUser, profile) {
  navActions.replaceChildren();

  const menu = document.createElement('div');
  menu.className = 'profile-menu';
  const toggle = document.createElement('button');
  toggle.className = 'profile-menu-button';
  toggle.type = 'button';
  toggle.setAttribute('aria-label', 'Open profile menu');
  toggle.setAttribute('aria-haspopup', 'menu');
  toggle.setAttribute('aria-expanded', 'false');
  const renderAvatar = (photo) => {
    toggle.replaceChildren();
    if (photo) {
      const image = document.createElement('img');
      image.src = photo;
      image.alt = '';
      toggle.appendChild(image);
    } else {
      const initials = `${profile.firstName?.[0] || ''}${profile.lastName?.[0] || ''}`.toUpperCase() || 'U';
      const initialsLabel = document.createElement('span');
      initialsLabel.className = 'profile-menu-initials';
      initialsLabel.textContent = initials;
      toggle.appendChild(initialsLabel);
    }
  };
  renderAvatar(profile.profilePhoto);

  const dropdown = document.createElement('div');
  dropdown.className = 'profile-menu-dropdown';
  dropdown.hidden = true;
  dropdown.setAttribute('role', 'menu');

  const profileLink = document.createElement('a');
  profileLink.href = 'profile.html';
  profileLink.textContent = 'Profile';
  profileLink.setAttribute('role', 'menuitem');

  const photoButton = document.createElement('button');
  photoButton.type = 'button';
  photoButton.textContent = profile.profilePhoto ? 'Change photo' : 'Set profile photo';
  photoButton.setAttribute('role', 'menuitem');
  const photoInput = document.createElement('input');
  photoInput.type = 'file';
  photoInput.accept = 'image/*';
  photoInput.hidden = true;
  const photoStatus = document.createElement('span');
  photoStatus.className = 'profile-menu-status';
  photoStatus.setAttribute('role', 'status');

  photoButton.addEventListener('click', () => photoInput.click());
  photoInput.addEventListener('change', async () => {
    const file = photoInput.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/') || file.size > 10 * 1024 * 1024) {
      photoStatus.textContent = 'Choose an image under 10 MB.';
      photoInput.value = '';
      return;
    }

    try {
      photoStatus.textContent = 'Saving photo…';
      const image = await createImageBitmap(file);
      const size = 256;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext('2d');
      const cropSize = Math.min(image.width, image.height);
      context.drawImage(image, (image.width - cropSize) / 2, (image.height - cropSize) / 2, cropSize, cropSize, 0, 0, size, size);
      image.close();
      const photo = canvas.toDataURL('image/jpeg', 0.78);
      if (photo.length > 300000) throw new Error('Choose a smaller image.');
      await updateDoc(doc(db, 'users', firebaseUser.uid), { profilePhoto: photo });
      profile.profilePhoto = photo;
      renderAvatar(photo);
      photoButton.textContent = 'Change photo';
      photoStatus.textContent = 'Photo saved.';
    } catch (error) {
      photoStatus.textContent = error.message === 'Choose a smaller image.'
        ? error.message
        : 'Photo could not be saved. Try again.';
    } finally {
      photoInput.value = '';
    }
  });

  const logoutButton = document.createElement('button');
  logoutButton.type = 'button';
  logoutButton.textContent = 'Log out';
  logoutButton.setAttribute('role', 'menuitem');
  logoutButton.addEventListener('click', async () => {
    await signOut(auth);
    localStorage.removeItem('makingsCurrentUser');
    localStorage.removeItem('makingsAuthUid');
    window.location.href = 'verification.html#login';
  });

  toggle.addEventListener('click', () => {
    dropdown.hidden = !dropdown.hidden;
    toggle.setAttribute('aria-expanded', String(!dropdown.hidden));
  });
  dropdown.append(profileLink, photoButton, photoInput, photoStatus, logoutButton);
  menu.append(toggle, dropdown);
  navActions.appendChild(menu);
}

document.addEventListener('click', (event) => {
  const menu = navActions?.querySelector('.profile-menu');
  if (!menu || menu.contains(event.target)) return;
  menu.querySelector('.profile-menu-dropdown').hidden = true;
  menu.querySelector('.profile-menu-button').setAttribute('aria-expanded', 'false');
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  const menu = navActions?.querySelector('.profile-menu');
  if (!menu) return;
  menu.querySelector('.profile-menu-dropdown').hidden = true;
  menu.querySelector('.profile-menu-button').setAttribute('aria-expanded', 'false');
});

onAuthStateChanged(auth, async (firebaseUser) => {
  if (!navActions) return;
  if (!firebaseUser) {
    renderSignedOut();
    return;
  }

  try {
    const profileSnapshot = await getDoc(doc(db, 'users', firebaseUser.uid));
    if (!profileSnapshot.exists()) {
      renderSignedOut();
      return;
    }
    const profile = profileSnapshot.data();
    const preferredCurrency = String(profile.preferredCurrency || '').toUpperCase();
    if (['USD', 'JMD', 'EUR'].includes(preferredCurrency)) {
      localStorage.setItem('preferredCurrency', preferredCurrency.toLowerCase());
    }
    window.dispatchEvent(new CustomEvent('makings:account-currency-changed', {
      detail: { ...profile, uid: firebaseUser.uid, preferredCurrency }
    }));
    renderSignedIn(firebaseUser, profile);
  } catch (error) {
    console.error('Unable to load the signed-in profile for navigation:', error);
    renderSignedIn(firebaseUser, {});
  }
});