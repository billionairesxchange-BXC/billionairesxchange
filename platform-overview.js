const overviewButton = document.getElementById('platformOverviewButton');
const overviewStatus = document.getElementById('platformOverviewStatus');

if (overviewButton && overviewStatus) {
  const speech = window.speechSynthesis;
  const playIcon = overviewButton.querySelector('[aria-hidden="true"]');
  const buttonLabel = overviewButton.querySelector('span:not([aria-hidden="true"])');
  const overview = [
    'Welcome to BillionairesXchange, a platform for exploring digital markets and financial services.',
    'Use the Trade and Investment Center to explore available crypto markets, companies, and investment products. Review each opportunity, its terms, and its risks before making a decision.',
    'Visit the Shop to browse marketplace categories, including gadgets, gaming, and Bitcoin mining equipment.',
    'Create Coin provides tools to create and publish a custom coin.',
    'The Trading Bot area lets you review and configure automated trading options. Automation does not guarantee results, so understand the settings and risks before enabling a bot.',
    'Your Wallet brings together available account and transaction features. Depending on the services enabled for your account, you can deposit or withdraw funds, send funds, transfer between accounts, and pay bills.',
    'You can also explore card requests, account settings, profile tools, and About and Support for help.',
    'Availability, fees, and eligibility can vary by service. Take a moment to review the details before you proceed. Thank you for visiting BillionairesXchange.'
  ].join(' ');

  const resetButton = () => {
    overviewButton.setAttribute('aria-pressed', 'false');
    playIcon.textContent = '▶';
    buttonLabel.textContent = 'Listen to platform overview';
  };

  const selectVoice = () => {
    const voices = speech.getVoices();
    const englishVoices = voices.filter((voice) => /^en(-|$)/i.test(voice.lang));
    const femaleVoice = englishVoices.find((voice) =>
      /\b(female|zira|samantha|victoria|katherine|susan|hazel|eva|aria|jenny|serena|tessa|fiona)\b/i.test(voice.name)
    );
    return femaleVoice || englishVoices[0] || null;
  };

  if (!speech || typeof window.SpeechSynthesisUtterance !== 'function') {
    overviewButton.disabled = true;
    overviewStatus.textContent = 'Audio narration is not supported in this browser.';
  } else {
    overviewButton.addEventListener('click', () => {
      if (speech.speaking && speech.paused) {
        speech.resume();
        playIcon.textContent = '⏸';
        buttonLabel.textContent = 'Pause overview';
        overviewButton.setAttribute('aria-pressed', 'true');
        overviewStatus.textContent = 'Platform overview is playing.';
        return;
      }

      if (speech.speaking) {
        speech.pause();
        playIcon.textContent = '▶';
        buttonLabel.textContent = 'Resume overview';
        overviewButton.setAttribute('aria-pressed', 'false');
        overviewStatus.textContent = 'Platform overview paused.';
        return;
      }

      const utterance = new window.SpeechSynthesisUtterance(overview);
      const voice = selectVoice();
      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang;
      } else {
        utterance.lang = 'en-US';
      }
      utterance.pitch = 1.05;
      utterance.rate = 1;
      utterance.onstart = () => {
        playIcon.textContent = '⏸';
        buttonLabel.textContent = 'Pause overview';
        overviewButton.setAttribute('aria-pressed', 'true');
        overviewStatus.textContent = 'Platform overview is playing.';
      };
      utterance.onend = () => {
        resetButton();
        overviewStatus.textContent = 'Platform overview finished.';
      };
      utterance.onerror = (event) => {
        resetButton();
        overviewStatus.textContent = 'Audio narration could not be played.';
        console.error('Platform overview speech failed:', event.error);
      };
      overviewButton.disabled = true;
      speech.cancel();
      speech.speak(utterance);
      overviewButton.disabled = false;
    });

    if (!selectVoice()) {
      overviewStatus.textContent = 'Uses an English voice available in your browser.';
      speech.addEventListener('voiceschanged', () => {
        if (selectVoice()) overviewStatus.textContent = '';
      }, { once: true });
    } else {
      overviewStatus.textContent = 'Uses an English voice available in your browser.';
    }
  }
}
