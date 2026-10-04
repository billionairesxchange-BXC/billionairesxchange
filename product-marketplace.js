import { getApp, getApps, initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  updateDoc,
  where,
  getFirestore
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

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
const page = document.getElementById('productMarketplace');
const category = page.dataset.category;
const categoryNames = {
  gadgets: 'Gadgets',
  gaming: 'Gaming',
  miners: 'Bitcoin Miners'
};
const categoryName = categoryNames[category];
const listingsRef = collection(db, 'shopProductListings');
const requestsRef = collection(db, 'shopPurchaseRequests');
const listingForm = document.getElementById('productListingForm');
const listingContainer = document.getElementById('productListings');
const requestContainer = document.getElementById('productRequests');
const listingStatus = document.getElementById('productListingStatus');
const sellStatus = document.getElementById('productSellStatus');
const requestStatus = document.getElementById('productRequestStatus');
const purchaseDialog = document.getElementById('purchaseRequestDialog');
const purchaseForm = document.getElementById('purchaseRequestForm');
const purchaseSummary = document.getElementById('purchaseRequestSummary');
const requestMessage = document.getElementById('purchaseRequestMessage');
const listingPrice = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' });
let currentUser = null;
let currentUsername = '';
let selectedListing = null;

document.getElementById('productMarketplaceTitle').textContent = `${categoryName} Marketplace`;
document.getElementById('productMarketplaceDescription').textContent = `Browse ${categoryName.toLowerCase()} listings from the community, request to buy an item, or post an item for sale.`;

function setStatus(element, message) {
  element.textContent = message;
}

function makeButton(label, className, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

function formatDate(value) {
  const date = value?.toDate?.() || new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString();
}

function setView(view) {
  document.querySelectorAll('[data-marketplace-view]').forEach((button) => {
    const active = button.dataset.marketplaceView === view;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  document.querySelectorAll('[data-marketplace-panel]').forEach((panel) => {
    panel.hidden = panel.dataset.marketplacePanel !== view;
  });
  if (view === 'requests') loadRequests();
}

function renderListings(listings) {
  listingContainer.replaceChildren();
  if (!listings.length) {
    const empty = document.createElement('p');
    empty.className = 'product-marketplace-empty';
    empty.textContent = `No ${categoryName.toLowerCase()} listings yet. Be the first to post one.`;
    listingContainer.appendChild(empty);
    return;
  }

  listings.forEach((listing) => {
    const card = document.createElement('article');
    card.className = 'product-listing-card';
    const heading = document.createElement('div');
    heading.className = 'product-listing-heading';
    const title = document.createElement('h3');
    title.textContent = listing.title;
    const price = document.createElement('strong');
    price.textContent = listingPrice.format(listing.price);
    heading.append(title, price);

    const meta = document.createElement('p');
    meta.className = 'product-listing-meta';
    meta.textContent = `${listing.condition} · Seller: ${listing.sellerUsername} · Listed ${formatDate(listing.createdAt)}`;
    const description = document.createElement('p');
    description.className = 'product-listing-description';
    description.textContent = listing.description;
    const actions = document.createElement('div');
    actions.className = 'product-listing-actions';

    if (currentUser?.uid === listing.sellerUid) {
      actions.appendChild(makeButton('Remove listing', 'btn btn-ghost', async () => {
        if (!window.confirm('Remove this listing?')) return;
        try {
          await deleteDoc(doc(db, 'shopProductListings', listing.id));
          await loadListings();
        } catch (error) {
          console.error('Unable to remove product listing:', error);
          setStatus(listingStatus, 'Could not remove this listing. Try again later.');
        }
      }));
    } else {
      actions.appendChild(makeButton('Request to buy', 'btn btn-primary', () => {
        if (!currentUser) {
          setStatus(listingStatus, 'Sign in to request this item.');
          return;
        }
        selectedListing = listing;
        purchaseSummary.textContent = `${listing.title} from ${listing.sellerUsername} for ${listingPrice.format(listing.price)}. Payment is arranged directly with the seller; no payment is processed here.`;
        requestMessage.value = '';
        purchaseDialog.showModal();
      }));
    }

    card.append(heading, meta, description, actions);
    listingContainer.appendChild(card);
  });
}

async function loadListings() {
  setStatus(listingStatus, 'Loading listings...');
  try {
    const snapshot = await getDocs(query(listingsRef, where('category', '==', category), limit(100)));
    const listings = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    listings.sort((left, right) => (right.createdAt?.toMillis?.() || 0) - (left.createdAt?.toMillis?.() || 0));
    renderListings(listings);
    setStatus(listingStatus, `${listings.length} listing${listings.length === 1 ? '' : 's'} available.`);
  } catch (error) {
    console.error('Unable to load product listings:', error);
    setStatus(listingStatus, 'Could not load listings. Check your connection and try again.');
  }
}

function renderRequestCard(request, isIncoming) {
  const card = document.createElement('article');
  card.className = 'product-request-card';
  const title = document.createElement('h3');
  title.textContent = request.listingTitle;
  const details = document.createElement('p');
  details.textContent = isIncoming
    ? `From ${request.buyerUsername}: ${request.buyerMessage || 'No message provided.'}`
    : `To ${request.sellerUsername}${request.buyerMessage ? ` · ${request.buyerMessage}` : ''}`;
  const status = document.createElement('span');
  status.className = `product-request-status is-${request.status}`;
  status.textContent = request.status;
  const date = document.createElement('small');
  date.textContent = formatDate(request.createdAt);
  card.append(title, details, status, date);

  if (isIncoming && request.status === 'pending') {
    const actions = document.createElement('div');
    actions.className = 'product-listing-actions';
    ['accepted', 'declined'].forEach((nextStatus) => {
      const label = nextStatus === 'accepted' ? 'Accept request' : 'Decline request';
      actions.appendChild(makeButton(label, nextStatus === 'accepted' ? 'btn btn-primary' : 'btn btn-ghost', async () => {
        try {
          await updateDoc(doc(db, 'shopPurchaseRequests', request.id), { status: nextStatus });
          await loadRequests();
        } catch (error) {
          console.error('Unable to update purchase request:', error);
          setStatus(requestStatus, 'Could not update this request. Try again later.');
        }
      }));
    });
    card.appendChild(actions);
  }
  return card;
}

async function loadRequests() {
  if (!currentUser) {
    setStatus(requestStatus, 'Sign in to review your buying and selling requests.');
    requestContainer.replaceChildren();
    return;
  }
  setStatus(requestStatus, 'Loading your requests...');
  try {
    const [outgoing, incoming] = await Promise.all([
      getDocs(query(requestsRef, where('buyerUid', '==', currentUser.uid), limit(100))),
      getDocs(query(requestsRef, where('sellerUid', '==', currentUser.uid), limit(100)))
    ]);
    const incomingIds = new Set(incoming.docs.map((item) => item.id));
    requestContainer.replaceChildren();
    const groups = [
      { title: 'Requests to buy', docs: outgoing.docs.filter((item) => !incomingIds.has(item.id)), incoming: false },
      { title: 'Requests for your listings', docs: incoming.docs, incoming: true }
    ];
    let count = 0;
    groups.forEach((group) => {
      const section = document.createElement('section');
      section.className = 'product-request-group';
      const heading = document.createElement('h3');
      heading.textContent = group.title;
      section.appendChild(heading);
      group.docs.forEach((item) => {
        section.appendChild(renderRequestCard({ id: item.id, ...item.data() }, group.incoming));
        count += 1;
      });
      requestContainer.appendChild(section);
    });
    setStatus(requestStatus, count ? `${count} request${count === 1 ? '' : 's'}.` : 'No buying or selling requests yet.');
  } catch (error) {
    console.error('Unable to load purchase requests:', error);
    setStatus(requestStatus, 'Could not load requests. Check your connection and try again.');
  }
}

document.querySelectorAll('[data-marketplace-view]').forEach((button) => {
  button.addEventListener('click', () => setView(button.dataset.marketplaceView));
});

listingForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!currentUser || !currentUsername) {
    setStatus(sellStatus, 'Sign in and complete your profile before publishing a listing.');
    return;
  }
  const formData = new FormData(listingForm);
  const title = String(formData.get('title') || '').trim();
  const description = String(formData.get('description') || '').trim();
  const price = Number(formData.get('price'));
  if (!title || !description || !Number.isFinite(price) || price <= 0) {
    setStatus(sellStatus, 'Enter an item name, description, and a price greater than zero.');
    return;
  }

  const submitButton = listingForm.querySelector('[type="submit"]');
  submitButton.disabled = true;
  setStatus(sellStatus, 'Publishing your listing...');
  try {
    await addDoc(listingsRef, {
      sellerUid: currentUser.uid,
      sellerUsername: currentUsername,
      category,
      title,
      description,
      condition: String(formData.get('condition')),
      price,
      createdAt: serverTimestamp()
    });
    listingForm.reset();
    setStatus(sellStatus, 'Your listing is live.');
    await loadListings();
    setView('browse');
  } catch (error) {
    console.error('Unable to publish product listing:', error);
    setStatus(sellStatus, 'Could not publish the listing. Check your connection and try again.');
  } finally {
    submitButton.disabled = !currentUser;
  }
});

purchaseForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!currentUser || !currentUsername || !selectedListing) return;
  const submitButton = purchaseForm.querySelector('[type="submit"]');
  submitButton.disabled = true;
  try {
    await addDoc(requestsRef, {
      listingId: selectedListing.id,
      category,
      listingTitle: selectedListing.title,
      sellerUid: selectedListing.sellerUid,
      sellerUsername: selectedListing.sellerUsername,
      buyerUid: currentUser.uid,
      buyerUsername: currentUsername,
      buyerMessage: requestMessage.value.trim(),
      status: 'pending',
      createdAt: serverTimestamp()
    });
    purchaseDialog.close();
    setStatus(requestStatus, 'Your request was sent to the seller.');
    setView('requests');
  } catch (error) {
    console.error('Unable to send purchase request:', error);
    setStatus(requestStatus, 'Could not send your request. Check your connection and try again.');
  } finally {
    submitButton.disabled = false;
  }
});

document.getElementById('closePurchaseRequest').addEventListener('click', () => purchaseDialog.close());

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  currentUsername = '';
  if (user) {
    try {
      const profile = await getDoc(doc(db, 'users', user.uid));
      currentUsername = profile.exists() ? String(profile.data().username || '') : '';
    } catch (error) {
      console.error('Unable to load marketplace profile:', error);
    }
  }
  const signedIn = Boolean(user && currentUsername);
  listingForm.querySelector('[type="submit"]').disabled = !signedIn;
  document.getElementById('productSignInHint').hidden = signedIn;
  await loadListings();
  if (document.querySelector('[data-marketplace-panel="requests"]')?.hidden === false) loadRequests();
});

loadListings();