import { getApp, getApps, initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { addDoc, collection, getFirestore, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

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
let signedInAccount = auth.currentUser;

const investmentSelection = document.getElementById('investmentSelection');
const startInvestmentBtn = document.getElementById('startInvestmentBtn');
const companyInvestmentSetup = document.getElementById('companyInvestmentSetup');
const existingCompanyPanel = document.getElementById('existingCompanyPanel');
const registerCompanyPanel = document.getElementById('registerCompanyPanel');
const existingCompanyChoices = document.getElementById('existingCompanyChoices');
const coinsInvestmentSetup = document.getElementById('coinsInvestmentSetup');
const customCoinChoices = document.getElementById('customCoinChoices');
const coinInvestmentEmpty = document.getElementById('coinInvestmentEmpty');
const companyRegistrationForm = registerCompanyPanel;
const selectedCompanyDetails = document.getElementById('selectedCompanyDetails');
const selectedCompanyLogo = document.getElementById('selectedCompanyLogo');
const selectedCompanyContractStatus = document.getElementById('selectedCompanyContractStatus');
const selectedCompanyContractText = document.getElementById('selectedCompanyContractText');
const selectedCompanyContractPages = document.getElementById('selectedCompanyContractPages');
const downloadSelectedCompanyContract = document.getElementById('downloadSelectedCompanyContract');
const selectedCompanyAgreementDocument = document.getElementById('selectedCompanyAgreementDocument');
const selectedCompanyAgreementStatus = document.getElementById('selectedCompanyAgreementStatus');
const selectedCompanyAgreementPdfPanel = document.getElementById('selectedCompanyAgreementPdfPanel');
const selectedCompanyAgreementPages = document.getElementById('selectedCompanyAgreementPages');
const selectedCompanyAgreementPdfName = document.getElementById('selectedCompanyAgreementPdfName');
const downloadSelectedCompanyAgreement = document.getElementById('downloadSelectedCompanyAgreement');
const sendContractToInboxButton = document.getElementById('sendContractToInbox');
const companyInvestmentAmount = document.getElementById('companyInvestmentAmount');
const companyInvestmentTerm = document.getElementById('companyInvestmentTerm');
const investmentCurrencySelect = document.getElementById('investmentCurrency');
const companyLogoInput = document.getElementById('companyLogo');
const companyLogoPreview = document.getElementById('companyLogoPreview');
const companyLogoPreviewImage = document.getElementById('companyLogoPreviewImage');
const companyContractDocument = document.getElementById('companyContractDocument');
const companyContractPdfInput = document.getElementById('companyContractPdf');
const companyContractEditor = document.getElementById('companyContractEditor');
const contractPdfPanel = document.getElementById('contractPdfPanel');
const contractPdfPages = document.getElementById('contractPdfPages');
const contractPdfName = document.getElementById('contractPdfName');
const downloadContractPdf = document.getElementById('downloadContractPdf');
const contractPdfStatus = document.getElementById('contractPdfStatus');
const investorNameInput = document.getElementById('investorName');
const investorTypeInput = document.getElementById('investorType');
const investorCompanyInput = document.getElementById('investorCompany');
const investorSignatureCanvas = document.getElementById('investorSignatureCanvas');
const investorSignatureStatus = document.getElementById('investorSignatureStatus');
const investorTypedSignature = document.getElementById('investorTypedSignature');
const signatureContext = investorSignatureCanvas.getContext('2d');
signatureContext.strokeStyle = '#f7e8aa';
signatureContext.lineWidth = 3;
signatureContext.lineCap = 'round';
signatureContext.lineJoin = 'round';
let selectedInvestment = '';
let selectedCompanyPath = 'existing';
let selectedExistingCompany = '';
let selectedCoin = null;
let signatureHasInk = false;
let isDrawingSignature = false;
let contractPdfObjectUrl = '';
let uploadedContractPdfDataUrl = '';
let contractPdfRenderId = 0;
let selectedCompanyPdfRenderId = 0;
let selectedAgreementPdfObjectUrl = '';
let selectedAgreementPdfRenderId = 0;
let selectedCompanyRecord = null;

onAuthStateChanged(auth, (user) => {
  signedInAccount = user;
  if (sendContractToInboxButton) {
    sendContractToInboxButton.disabled = !user;
    if (!user) selectedCompanyAgreementStatus.textContent = 'Sign in to send a signed contract to your Community inbox.';
  }
});

async function renderPdfDocument(blob, pagesContainer, statusElement, isCurrent, errorMessage) {
  pagesContainer.replaceChildren();
  statusElement.textContent = 'Rendering PDF preview...';

  try {
    const pdfjsLib = await import('./node_modules/pdfjs-dist/build/pdf.mjs');
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('node_modules/pdfjs-dist/build/pdf.worker.min.mjs', document.baseURI).href;
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
    if (!isCurrent()) return;

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      if (!isCurrent()) return;
      const baseViewport = page.getViewport({ scale: 1 });
      const availableWidth = Math.max(240, pagesContainer.clientWidth - 32);
      const scale = Math.min(1.2, availableWidth / baseViewport.width);
      const viewport = page.getViewport({ scale });
      const pageFrame = document.createElement('div');
      pageFrame.className = 'contract-pdf-page';
      const canvas = document.createElement('canvas');
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.ceil(viewport.width * pixelRatio);
      canvas.height = Math.ceil(viewport.height * pixelRatio);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      canvas.setAttribute('aria-label', `Contract PDF page ${pageNumber}`);
      pageFrame.appendChild(canvas);
      pagesContainer.appendChild(pageFrame);
      const context = canvas.getContext('2d');
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      await page.render({ canvasContext: context, viewport }).promise;
    }

    if (isCurrent()) {
      statusElement.textContent = `${pdf.numPages} page${pdf.numPages === 1 ? '' : 's'} ready to preview.`;
    }
  } catch {
    if (isCurrent()) {
      statusElement.textContent = errorMessage;
    }
  }
}

async function renderContractPdf(blob) {
  const renderId = ++contractPdfRenderId;
  await renderPdfDocument(blob, contractPdfPages, contractPdfStatus, () => renderId === contractPdfRenderId, 'The PDF preview could not be rendered. Download the PDF to view or print it.');
}

async function renderSelectedCompanyPdf(dataUrl) {
  const renderId = ++selectedCompanyPdfRenderId;
  try {
    const response = await fetch(dataUrl);
    if (!response.ok) throw new Error('Unable to load saved company contract.');
    const blob = await response.blob();
    await renderPdfDocument(blob, selectedCompanyContractPages, selectedCompanyContractStatus, () => renderId === selectedCompanyPdfRenderId, 'The company PDF could not be previewed. Download it to view the contract.');
  } catch {
    if (renderId === selectedCompanyPdfRenderId) {
      selectedCompanyContractStatus.textContent = 'The company PDF could not be previewed. Download it to view the contract.';
    }
  }
}

function setCompanyDetailValue(id, value) {
  const text = typeof value === 'string' ? value.trim() : '';
  document.getElementById(id).textContent = text || 'Not provided';
}

function renderSelectedCompanyDetails(company) {
  selectedCompanyRecord = company;
  selectedCompanyDetails.hidden = false;
  document.getElementById('selectedCompanyName').textContent = company.name || 'Company profile';
  document.getElementById('selectedCompanyRegisteredName').textContent = company.name || 'Not provided';
  setCompanyDetailValue('selectedCompanyRegistration', company.registrationNumber);
  setCompanyDetailValue('selectedCompanyEmail', company.email);
  setCompanyDetailValue('selectedCompanyPhone', company.phone);
  setCompanyDetailValue('selectedCompanyAddress', company.address);
  setCompanyDetailValue('selectedCompanyCountry', company.country);
  setCompanyDetailValue('selectedCompanyType', company.type);
  setCompanyDetailValue('selectedCompanyDescription', company.description);
  setCompanyDetailValue('selectedCompanyInvestorPurpose', company.investorPurpose);

  selectedCompanyLogo.replaceChildren();
  if (company.logo && /^data:image\/png;base64,/i.test(company.logo)) {
    const image = document.createElement('img');
    image.src = company.logo;
    image.alt = '';
    selectedCompanyLogo.appendChild(image);
  } else {
    selectedCompanyLogo.textContent = (company.name || '?').split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase();
  }

  investorNameInput.value = '';
  investorTypeInput.value = 'Individual';
  investorCompanyInput.value = '';
  investorTypedSignature.value = '';
  signatureContext.clearRect(0, 0, investorSignatureCanvas.width, investorSignatureCanvas.height);
  signatureHasInk = false;
  investorSignatureStatus.textContent = 'Draw your signature above or type your full legal name.';
  selectedCompanyAgreementDocument.value = '';
  selectedCompanyAgreementPdfPanel.hidden = true;
  selectedCompanyAgreementPages.replaceChildren();
  selectedCompanyAgreementStatus.textContent = 'Enter investor details and generate the default contract.';
  if (selectedAgreementPdfObjectUrl) URL.revokeObjectURL(selectedAgreementPdfObjectUrl);
  selectedAgreementPdfObjectUrl = '';
  downloadSelectedCompanyAgreement.hidden = true;
  selectedAgreementPdfRenderId += 1;

  selectedCompanyPdfRenderId += 1;
  selectedCompanyContractPages.replaceChildren();
  selectedCompanyContractPages.hidden = true;
  selectedCompanyContractText.hidden = true;
  downloadSelectedCompanyContract.hidden = true;
  if (company.contractPdfDataUrl) {
    const fileName = company.contractPdfName || `${company.name || 'company'}-contract.pdf`;
    downloadSelectedCompanyContract.href = company.contractPdfDataUrl;
    downloadSelectedCompanyContract.download = fileName;
    downloadSelectedCompanyContract.hidden = false;
    selectedCompanyContractPages.hidden = false;
    renderSelectedCompanyPdf(company.contractPdfDataUrl);
  } else if (company.contractDocument?.trim()) {
    selectedCompanyContractText.textContent = company.contractDocument;
    selectedCompanyContractText.hidden = false;
    selectedCompanyContractStatus.textContent = 'Saved company agreement';
  } else {
    selectedCompanyContractStatus.textContent = 'No contract has been saved for this company.';
  }
}

function setContractPdfPreview(blob, fileName, showEditor) {
  if (contractPdfObjectUrl) URL.revokeObjectURL(contractPdfObjectUrl);
  contractPdfObjectUrl = URL.createObjectURL(blob);
  contractPdfName.textContent = fileName;
  downloadContractPdf.href = contractPdfObjectUrl;
  downloadContractPdf.download = fileName;
  downloadContractPdf.hidden = false;
  contractPdfPanel.hidden = false;
  companyContractEditor.hidden = !showEditor;
  renderContractPdf(blob);
}

function createContractPdf(text, includeSignature) {
  const JsPdf = window.jspdf?.jsPDF;
  if (!JsPdf) {
    throw new Error('PDF tools could not be loaded. Reload the page and try again.');
  }
  const pdf = new JsPdf({ unit: 'pt', format: 'a4' });
  const margin = 48;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const lines = pdf.splitTextToSize(text, pageWidth - margin * 2);
  let y = margin;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  lines.forEach((line) => {
    if (y > pageHeight - margin) {
      pdf.addPage();
      y = margin;
    }
    pdf.text(line, margin, y);
    y += 14;
  });

  const typedSignature = investorTypedSignature.value.trim();
  if (includeSignature && (signatureHasInk || typedSignature)) {
    if (y > pageHeight - margin - 70) {
      pdf.addPage();
      y = margin;
    }
    y += 12;
    pdf.setFont('helvetica', 'bold');
    pdf.text('Investor signature', margin, y);
    if (signatureHasInk) {
      pdf.addImage(investorSignatureCanvas.toDataURL('image/png'), 'PNG', margin, y + 8, 200, 40);
    } else {
      pdf.setFont('helvetica', 'normal');
      pdf.text(typedSignature, margin, y + 24);
    }
  }

  return pdf.output('blob');
}

function generateCompanyContractPdf() {
  if (!companyContractDocument.value.trim()) return;
  try {
    const blob = createContractPdf(companyContractDocument.value, false);
    const name = document.getElementById('companyName').value.trim() || 'company';
    const fileBase = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    setContractPdfPreview(blob, `${fileBase}-company-contract.pdf`, true);
  } catch (error) {
    contractPdfStatus.textContent = error.message;
  }
}

function setSelectedCompanyAgreementPdf(blob) {
  if (selectedAgreementPdfObjectUrl) URL.revokeObjectURL(selectedAgreementPdfObjectUrl);
  selectedAgreementPdfObjectUrl = URL.createObjectURL(blob);
  const name = selectedCompanyRecord?.name || 'company';
  const fileBase = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'company';
  const fileName = `${fileBase}-signed-investment-agreement.pdf`;
  selectedCompanyAgreementPdfName.textContent = fileName;
  downloadSelectedCompanyAgreement.href = selectedAgreementPdfObjectUrl;
  downloadSelectedCompanyAgreement.download = fileName;
  downloadSelectedCompanyAgreement.hidden = false;
  selectedCompanyAgreementPdfPanel.hidden = false;
  const renderId = ++selectedAgreementPdfRenderId;
  renderPdfDocument(blob, selectedCompanyAgreementPages, selectedCompanyAgreementStatus, () => renderId === selectedAgreementPdfRenderId, 'The signed contract preview could not be rendered.');
}

function generateDefaultAgreementPdf() {
  if (!selectedCompanyRecord || !selectedCompanyAgreementDocument.value.trim()) return;
  try {
    setSelectedCompanyAgreementPdf(createContractPdf(selectedCompanyAgreementDocument.value, true));
  } catch (error) {
    selectedCompanyAgreementStatus.textContent = error.message;
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(reader.result));
    reader.addEventListener('error', () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}

companyContractPdfInput.addEventListener('change', async () => {
  const file = companyContractPdfInput.files[0];
  if (!file) return;
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    contractPdfStatus.textContent = 'Choose a PDF file for the contract.';
    companyContractPdfInput.value = '';
    return;
  }
  if (file.size > 1024 * 1024) {
    contractPdfStatus.textContent = 'Choose a PDF smaller than 1 MB to save it with this company.';
    companyContractPdfInput.value = '';
    return;
  }
  try {
    uploadedContractPdfDataUrl = await readFileAsDataUrl(file);
    companyContractDocument.value = '';
    setContractPdfPreview(file, file.name, false);
    contractPdfStatus.textContent = 'Uploaded PDF is ready to save with the company.';
  } catch {
    contractPdfStatus.textContent = 'The PDF could not be read. Choose another file.';
    companyContractPdfInput.value = '';
    uploadedContractPdfDataUrl = '';
  }
});

function drawCompanyLogo(file) {
  return createImageBitmap(file).then((image) => {
    const logoSize = 128;
    const scale = Math.min(logoSize / image.width, logoSize / image.height, 1);
    const canvas = document.createElement('canvas');
    canvas.width = logoSize;
    canvas.height = logoSize;
    const context = canvas.getContext('2d');
    const width = image.width * scale;
    const height = image.height * scale;
    context.drawImage(image, (logoSize - width) / 2, (logoSize - height) / 2, width, height);
    image.close();
    return canvas.toDataURL('image/png');
  });
}

companyLogoInput.addEventListener('change', async () => {
  const file = companyLogoInput.files[0];
  if (!file) {
    companyLogoPreview.hidden = true;
    return;
  }
  if (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) {
    contractPdfStatus.textContent = 'Choose an image file smaller than 5 MB for the company logo.';
    companyLogoInput.value = '';
    companyLogoPreview.hidden = true;
    return;
  }
  try {
    companyLogoPreviewImage.src = await drawCompanyLogo(file);
    companyLogoPreview.hidden = false;
  } catch {
    contractPdfStatus.textContent = 'This company logo could not be opened. Choose another image.';
    companyLogoInput.value = '';
    companyLogoPreview.hidden = true;
  }
});

let usingCompanyContractTemplate = false;
let usingSelectedDefaultAgreement = false;

function insertCompanyContractTemplate() {
  usingCompanyContractTemplate = true;
  companyContractPdfInput.value = '';
  uploadedContractPdfDataUrl = '';
  companyContractEditor.hidden = false;
  const amount = Number(companyInvestmentAmount.value);
  const currency = investmentCurrencySelect.value.toUpperCase();
  const formattedAmount = amount > 0
    ? new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount)
    : `[Enter investment amount in ${currency}]`;
  companyContractDocument.value = [
    'DRAFT COMPANY INVESTMENT AGREEMENT',
    `Date: ${new Date().toISOString().slice(0, 10)}`,
    '',
    `Company: ${document.getElementById('companyName').value.trim() || '[Registered business name]'}`,
    `Registration Number: ${document.getElementById('companyRegistration').value.trim() || '[Registration number]'}`,
    `Investment Amount: ${formattedAmount} (${currency})`,
    `Investment Term: ${companyInvestmentTerm.value || '[Select investment term]'}`,
    '',
    'BUSINESS DESCRIPTION',
    document.getElementById('companyDescription').value.trim() || '[Describe the business and its services.]',
    '',
    'INVESTMENT PURPOSE',
    document.getElementById('companyInvestorPurpose').value.trim() || '[Describe why the company is looking for investors.]',
    '',
    'RISK ACKNOWLEDGMENT',
    'Investments involve risk, including the possible loss of principal. The parties should review all obligations and obtain independent legal advice before signing.',
    '',
    'Company Representative: ______________________________',
    'Signature: ____________________________________________'
  ].join('\n');
  generateCompanyContractPdf();
}

function insertSelectedCompanyAgreement() {
  if (!selectedCompanyRecord) {
    selectedCompanyAgreementStatus.textContent = 'Choose an existing company first.';
    return;
  }
  usingSelectedDefaultAgreement = true;
  const company = selectedCompanyRecord;
  const today = new Date().toISOString().slice(0, 10);
  const amount = Number(companyInvestmentAmount.value);
  const currency = investmentCurrencySelect.value.toUpperCase();
  const formattedAmount = amount > 0
    ? new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount)
    : `[Enter investment amount in ${currency}]`;
  selectedCompanyAgreementDocument.value = [
    'DRAFT INVESTMENT AGREEMENT',
    `Date: ${today}`,
    '',
    `Investor Name: ${investorNameInput.value.trim() || '[Enter investor name]'}`,
    `Investor Type: ${investorTypeInput.value || '[Select investor type]'}`,
    `Investor Company (Optional): ${investorCompanyInput.value.trim() || 'Not provided'}`,
    '',
    `Company: ${company.name || '[Registered business name]'}`,
    `Registration Number: ${company.registrationNumber || 'Not provided'}`,
    `Business Email: ${company.email || 'Not provided'}`,
    `Business Phone: ${company.phone || 'Not provided'}`,
    `Business Address: ${company.address || 'Not provided'}`,
    `Country of Registration: ${company.country || 'Not provided'}`,
    `Business Type: ${company.type || 'Not provided'}`,
    '',
    `Investment Amount: ${formattedAmount} (${currency})`,
    `Investment Term: ${companyInvestmentTerm.value || '[Select investment term]'}`,
    '',
    'PURPOSE AND TERMS',
    company.investorPurpose || '[Review the company investment purpose and terms.]',
    '',
    'RISK ACKNOWLEDGMENT',
    'The investor acknowledges that investments involve risk, including possible loss of principal. The parties should review all risks and obligations before signing.',
    '',
    'AGREEMENT',
    'The parties agree to review and execute the final terms only after independent legal review. This draft does not itself transfer funds or establish a binding agreement.',
    '',
    'SIGNATURES',
    `Investor Name: ${investorNameInput.value.trim() || '[Enter investor name]'}`,
    `Investor Type: ${investorTypeInput.value}`,
    `Investor Company (Optional): ${investorCompanyInput.value.trim() || 'Not provided'}`,
    `Investor Signature: ${investorTypedSignature.value.trim() || (signatureHasInk ? 'Drawn signature attached to the agreement PDF.' : '[Sign below]')}`,
    `Date: ${today}`,
    'Company Representative: ______________________________',
    'Company Signature: ____________________________________'
  ].join('\n');
  investorSignatureStatus.textContent = 'Review the agreement and sign below.';
  generateDefaultAgreementPdf();
}

document.getElementById('loadCompanyContractTemplate').addEventListener('click', insertCompanyContractTemplate);
document.getElementById('generateSelectedCompanyAgreement').addEventListener('click', insertSelectedCompanyAgreement);

companyContractDocument.addEventListener('input', () => {
  usingCompanyContractTemplate = false;
  uploadedContractPdfDataUrl = '';
  companyContractPdfInput.value = '';
  if (companyContractDocument.value.trim()) generateCompanyContractPdf();
});

selectedCompanyAgreementDocument.addEventListener('input', () => {
  usingSelectedDefaultAgreement = false;
  if (selectedCompanyAgreementDocument.value.trim()) generateDefaultAgreementPdf();
});

[companyInvestmentAmount, companyInvestmentTerm, investmentCurrencySelect].forEach((input) => {
  input.addEventListener('input', () => {
    if (usingCompanyContractTemplate) insertCompanyContractTemplate();
    if (usingSelectedDefaultAgreement) insertSelectedCompanyAgreement();
  });
  input.addEventListener('change', () => {
    if (usingCompanyContractTemplate) insertCompanyContractTemplate();
    if (usingSelectedDefaultAgreement) insertSelectedCompanyAgreement();
  });
});

[investorNameInput, investorTypeInput, investorCompanyInput].forEach((input) => {
  input.addEventListener('input', () => {
    if (usingSelectedDefaultAgreement) insertSelectedCompanyAgreement();
  });
  input.addEventListener('change', () => {
    if (usingSelectedDefaultAgreement) insertSelectedCompanyAgreement();
  });
});

downloadContractPdf.hidden = true;
downloadSelectedCompanyAgreement.hidden = true;
document.getElementById('printContractPdf').addEventListener('click', () => {
  const printWindow = window.open(contractPdfObjectUrl, '_blank', 'noopener');
  if (!printWindow) contractPdfStatus.textContent = 'Allow pop-ups to open the PDF for printing.';
});

function signaturePoint(event) {
  const bounds = investorSignatureCanvas.getBoundingClientRect();
  return {
    x: (event.clientX - bounds.left) * (investorSignatureCanvas.width / bounds.width),
    y: (event.clientY - bounds.top) * (investorSignatureCanvas.height / bounds.height)
  };
}

investorSignatureCanvas.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  isDrawingSignature = true;
  investorSignatureCanvas.setPointerCapture(event.pointerId);
  const point = signaturePoint(event);
  signatureContext.beginPath();
  signatureContext.moveTo(point.x, point.y);
  signatureContext.lineTo(point.x + 0.1, point.y + 0.1);
  signatureContext.stroke();
  signatureHasInk = true;
  investorSignatureStatus.textContent = 'Signature captured. You can clear it and sign again.';
});

investorSignatureCanvas.addEventListener('pointermove', (event) => {
  if (!isDrawingSignature) return;
  const point = signaturePoint(event);
  signatureContext.lineTo(point.x, point.y);
  signatureContext.stroke();
});

['pointerup', 'pointercancel'].forEach((eventName) => {
  investorSignatureCanvas.addEventListener(eventName, () => {
    isDrawingSignature = false;
    if (selectedCompanyAgreementDocument.value.trim()) generateDefaultAgreementPdf();
  });
});

document.getElementById('clearInvestorSignatureBtn').addEventListener('click', () => {
  signatureContext.clearRect(0, 0, investorSignatureCanvas.width, investorSignatureCanvas.height);
  signatureHasInk = false;
  investorSignatureStatus.textContent = 'Signature cleared. Draw or type your full legal name.';
  if (selectedCompanyAgreementDocument.value.trim()) generateDefaultAgreementPdf();
});

investorTypedSignature.addEventListener('input', () => {
  if (usingSelectedDefaultAgreement) insertSelectedCompanyAgreement();
});

document.querySelectorAll('[data-investment]').forEach((choice) => {
  choice.addEventListener('click', () => {
    selectedInvestment = choice.dataset.investment;
    document.querySelectorAll('[data-investment]').forEach((item) => item.classList.toggle('is-selected', item === choice));
    investmentSelection.textContent = `${selectedInvestment} selected. Review your choice, then start your investment.`;
    companyInvestmentSetup.hidden = selectedInvestment !== 'Company';
    coinsInvestmentSetup.hidden = selectedInvestment !== 'Coins';
    selectedCoin = null;
    customCoinChoices.querySelectorAll('.company-option').forEach((item) => {
      item.classList.remove('is-selected');
      item.setAttribute('aria-pressed', 'false');
    });
    startInvestmentBtn.disabled = false;
  });
});

const savedCoins = JSON.parse(localStorage.getItem('customCoins') || '[]');
const availableCoins = Array.isArray(savedCoins) ? savedCoins : [];
coinInvestmentEmpty.hidden = availableCoins.length > 0;
availableCoins.forEach((coin) => {
  if (!coin.name || !coin.symbol) return;
  const option = document.createElement('button');
  option.className = 'company-option';
  option.type = 'button';
  option.setAttribute('aria-pressed', 'false');

  const logo = document.createElement(coin.logo && /^data:image\/(png|webp|jpeg);base64,/i.test(coin.logo) ? 'img' : 'span');
  logo.className = 'company-option-logo';
  logo.setAttribute('aria-hidden', 'true');
  if (logo instanceof HTMLImageElement) {
    logo.src = coin.logo;
    logo.alt = '';
  } else {
    logo.textContent = coin.symbol.slice(0, 4).toUpperCase();
  }

  const details = document.createElement('span');
  details.className = 'company-option-details';
  const coinName = document.createElement('strong');
  coinName.textContent = coin.name;
  const coinSymbol = document.createElement('small');
  coinSymbol.textContent = coin.symbol.toUpperCase();
  details.append(coinName, coinSymbol);
  option.append(logo, details);

  option.addEventListener('click', () => {
    selectedCoin = coin;
    customCoinChoices.querySelectorAll('.company-option').forEach((item) => {
      const isSelected = item === option;
      item.classList.toggle('is-selected', isSelected);
      item.setAttribute('aria-pressed', String(isSelected));
    });
    investmentSelection.textContent = `${coin.name} (${coin.symbol.toUpperCase()}) selected. Start your investment when ready.`;
  });

  customCoinChoices.appendChild(option);
});

const savedCompanies = JSON.parse(localStorage.getItem('makingsRegisteredCompanies') || '[]');
const availableCompanies = [
  { name: 'Caribbean Renewables Ltd' },
  { name: 'Harbor Technology Group' },
  { name: 'Island Foods Co.' },
  ...savedCompanies
];
const companyNames = new Set();
availableCompanies.forEach((company) => {
  const name = company.name?.trim();
  if (!name || companyNames.has(name.toLowerCase())) return;
  companyNames.add(name.toLowerCase());

  const option = document.createElement('button');
  option.className = 'company-option';
  option.type = 'button';
  option.dataset.companyName = name;
  option.setAttribute('aria-pressed', 'false');

  const logo = document.createElement(company.logo && /^data:image\/png;base64,/i.test(company.logo) ? 'img' : 'span');
  logo.className = 'company-option-logo';
  logo.setAttribute('aria-hidden', 'true');
  if (logo instanceof HTMLImageElement) {
    logo.src = company.logo;
    logo.alt = '';
  } else {
    logo.textContent = name.split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase();
  }

  const details = document.createElement('span');
  details.className = 'company-option-details';
  const companyName = document.createElement('strong');
  companyName.textContent = name;
  const companyType = document.createElement('small');
  companyType.textContent = company.isRegistered ? 'Added by you' : 'Available company';
  details.append(companyName, companyType);
  option.append(logo, details);

  option.addEventListener('click', () => {
    selectedExistingCompany = name;
    renderSelectedCompanyDetails(company);
    existingCompanyChoices.querySelectorAll('.company-option').forEach((item) => {
      const isSelected = item === option;
      item.classList.toggle('is-selected', isSelected);
      item.setAttribute('aria-pressed', String(isSelected));
    });
    investmentSelection.textContent = `${name} selected. Enter an amount and term to continue.`;
  });

  existingCompanyChoices.appendChild(option);
});

document.querySelectorAll('[data-company-path]').forEach((pathButton) => {
  pathButton.addEventListener('click', () => {
    selectedCompanyPath = pathButton.dataset.companyPath;
    document.querySelectorAll('[data-company-path]').forEach((item) => item.classList.toggle('is-active', item === pathButton));
    existingCompanyPanel.hidden = selectedCompanyPath !== 'existing';
    registerCompanyPanel.hidden = selectedCompanyPath !== 'register';
  });
});

startInvestmentBtn.addEventListener('click', async () => {
  if (!selectedInvestment) return;
  const amount = Number(companyInvestmentAmount.value);
  let companyDetails = null;
  let coinDetails = null;
  if (selectedInvestment === 'Coins') {
    if (!selectedCoin) {
      investmentSelection.textContent = 'Choose a coin before starting your investment.';
      return;
    }
    coinDetails = { name: selectedCoin.name, symbol: selectedCoin.symbol, logo: selectedCoin.logo || null };
  }
  if (selectedInvestment === 'Company') {
    if (!amount || amount < 1 || !companyInvestmentTerm.value) {
      investmentSelection.textContent = 'Enter an investment amount and term before starting.';
      return;
    }
    if (selectedCompanyPath === 'register') {
      if (!uploadedContractPdfDataUrl && !companyContractDocument.value.trim()) {
        contractPdfStatus.textContent = 'Write a company contract or upload a PDF contract.';
        return;
      }
      if (!companyRegistrationForm.reportValidity()) return;
      let companyLogo = '';
      if (companyLogoInput.files[0]) {
        try {
          companyLogo = await drawCompanyLogo(companyLogoInput.files[0]);
        } catch {
          investmentSelection.textContent = 'The company logo could not be processed. Choose another image.';
          return;
        }
      }
      companyDetails = {
        name: document.getElementById('companyName').value.trim(),
        registrationNumber: document.getElementById('companyRegistration').value.trim(),
        currency: investmentCurrencySelect.value.toUpperCase(),
        logo: companyLogo || null,
        email: document.getElementById('companyEmail').value.trim(),
        phone: document.getElementById('companyPhone').value.trim(),
        address: document.getElementById('companyAddress').value.trim(),
        country: document.getElementById('companyCountry').value.trim(),
        type: document.getElementById('companyType').value,
        description: document.getElementById('companyDescription').value.trim(),
        investorPurpose: document.getElementById('companyInvestorPurpose').value.trim(),
        contractDocument: document.getElementById('companyContractDocument').value.trim(),
        contractPdfDataUrl: uploadedContractPdfDataUrl || null,
        contractPdfName: companyContractPdfInput.files[0]?.name || null,
        contractSource: uploadedContractPdfDataUrl ? 'uploaded-pdf' : 'company-text',
        contractAcknowledged: document.getElementById('companyContractAgreement').checked
      };
      const companies = JSON.parse(localStorage.getItem('makingsRegisteredCompanies') || '[]');
      companyDetails.isRegistered = true;
      companies.push(companyDetails);
      try {
        localStorage.setItem('makingsRegisteredCompanies', JSON.stringify(companies));
      } catch {
        contractPdfStatus.textContent = 'Browser storage is full. Use a smaller PDF or choose the Default Agreement.';
        return;
      }
    } else {
      if (!selectedExistingCompany) {
        investmentSelection.textContent = 'Choose a company before starting your investment.';
        return;
      }
      if (!investorNameInput.value.trim()) {
        investorSignatureStatus.textContent = 'Enter the investor name before continuing.';
        investorNameInput.focus();
        return;
      }
      if (!signatureHasInk && !investorTypedSignature.value.trim()) {
        investorSignatureStatus.textContent = 'Sign the default contract or type your full legal name before continuing.';
        investorTypedSignature.focus();
        return;
      }
      if (!selectedCompanyAgreementDocument.value.trim() || !selectedAgreementPdfObjectUrl) {
        selectedCompanyAgreementStatus.textContent = 'Generate and review the default contract before continuing.';
        return;
      }
      companyDetails = {
        name: selectedCompanyRecord.name,
        contractAcknowledged: true,
        investor: {
          name: investorNameInput.value.trim(),
          type: investorTypeInput.value,
          company: investorCompanyInput.value.trim() || null,
          signatureDataUrl: signatureHasInk ? investorSignatureCanvas.toDataURL('image/png') : null,
          typedSignature: investorTypedSignature.value.trim() || null,
          signedAt: new Date().toISOString()
        },
        contractDocument: selectedCompanyAgreementDocument.value.trim()
      };
    }
  }
  const investment = { type: selectedInvestment, amount: amount || null, currency: investmentCurrencySelect.value.toUpperCase(), term: selectedInvestment === 'Company' ? companyInvestmentTerm.value : null, company: companyDetails, coin: coinDetails, createdAt: new Date().toISOString() };
  localStorage.setItem('makingsSelectedInvestment', JSON.stringify(investment));
  const toast = document.getElementById('toast');
  toast.textContent = `${selectedInvestment} investment started. Your Treasury plan is ready for review.`;
  toast.classList.add('show');
  window.setTimeout(() => toast.classList.remove('show'), 3200);
});

sendContractToInboxButton.addEventListener('click', async () => {
  if (!signedInAccount) {
    selectedCompanyAgreementStatus.textContent = 'Sign in to send this contract to your Community inbox.';
    return;
  }
  if (!selectedCompanyRecord || !selectedAgreementPdfObjectUrl || !selectedCompanyAgreementDocument.value.trim()) {
    selectedCompanyAgreementStatus.textContent = 'Generate the default contract before sending it.';
    return;
  }
  if (!investorNameInput.value.trim() || (!signatureHasInk && !investorTypedSignature.value.trim())) {
    selectedCompanyAgreementStatus.textContent = 'Enter the investor name and sign the contract before sending.';
    return;
  }

  sendContractToInboxButton.disabled = true;
  selectedCompanyAgreementStatus.textContent = 'Sending contract to your Community inbox...';
  try {
    const pdfBlob = await (await fetch(selectedAgreementPdfObjectUrl)).blob();
    const pdfDataUrl = await readFileAsDataUrl(pdfBlob);
    if (pdfDataUrl.length > 800000) throw new Error('This contract PDF is too large to send.');
    const companyName = selectedCompanyRecord.name || 'Company';
    const fileName = downloadSelectedCompanyAgreement.download;
    await addDoc(collection(db, 'users', signedInAccount.uid, 'communityInbox'), {
      type: 'signed-investment-contract',
      subject: `Signed investment contract for ${companyName}`,
      senderUid: signedInAccount.uid,
      recipientUid: signedInAccount.uid,
      investorName: investorNameInput.value.trim(),
      investorType: investorTypeInput.value,
      investorCompany: investorCompanyInput.value.trim() || null,
      companyName,
      amount: Number(companyInvestmentAmount.value),
      currency: investmentCurrencySelect.value.toUpperCase(),
      term: companyInvestmentTerm.value,
      contractFileName: fileName,
      contractPdfDataUrl: pdfDataUrl,
      contractText: selectedCompanyAgreementDocument.value.trim(),
      createdAt: serverTimestamp()
    });
    window.location.href = 'community-inbox.html';
  } catch (error) {
    selectedCompanyAgreementStatus.textContent = error.message || 'Could not send the contract. Try again.';
    sendContractToInboxButton.disabled = false;
  }
});

if (window.location.hash === '#coins') {
  document.getElementById('coinsInvestmentChoice').click();
  coinsInvestmentSetup.scrollIntoView({ behavior: 'smooth', block: 'center' });
}