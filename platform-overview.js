const overviewButton = document.getElementById('platformOverviewButton');
const overviewStatus = document.getElementById('platformOverviewStatus');

if (overviewButton && overviewStatus) {
  const speech = window.speechSynthesis;
  const languageSelect = document.getElementById('platformOverviewLanguage');
  const playIcon = overviewButton.querySelector('[aria-hidden="true"]');
  const buttonLabel = overviewButton.querySelector('span:not([aria-hidden="true"])');
  const overviews = {
    'en-US': 'Welcome to BillionairesXchange, a platform for exploring digital markets and financial services. Use the Trade and Investment Center to explore available crypto markets, companies, and investment products. Review each opportunity, its terms, and its risks before making a decision. Visit the Shop to browse marketplace categories, including gadgets, gaming, and Bitcoin mining equipment. Create Coin provides tools to create and publish a custom coin. The Trading Bot area lets you review and configure automated trading options. Automation does not guarantee results, so understand the settings and risks before enabling a bot. Your Wallet brings together available account and transaction features. Depending on the services enabled for your account, you can deposit or withdraw funds, send funds, transfer between accounts, and pay bills. You can also explore card requests, account settings, profile tools, and About and Support for help. Availability, fees, and eligibility can vary by service. Take a moment to review the details before you proceed. Thank you for visiting BillionairesXchange.',
    'es-ES': 'Te damos la bienvenida a BillionairesXchange, una plataforma para explorar mercados digitales y servicios financieros. Utiliza el Centro de Trading e Inversiones para explorar los mercados de criptomonedas, las empresas y los productos de inversión disponibles. Revisa cada oportunidad, sus condiciones y sus riesgos antes de tomar una decisión. Visita la tienda para descubrir categorías como dispositivos, videojuegos y equipos de minería de Bitcoin. Crear moneda ofrece herramientas para crear y publicar una moneda personalizada. En la sección de bots de trading puedes revisar y configurar opciones de trading automatizado. La automatización no garantiza resultados; comprende la configuración y los riesgos antes de activar un bot. Tu billetera reúne las funciones disponibles de cuenta y transacciones. Según los servicios habilitados para tu cuenta, puedes depositar o retirar fondos, enviarlos, transferirlos entre cuentas y pagar facturas. También puedes consultar las solicitudes de tarjetas, la configuración de la cuenta, las herramientas de perfil y la sección Acerca de y soporte. La disponibilidad, las comisiones y los requisitos pueden variar según el servicio. Revisa los detalles antes de continuar. Gracias por visitar BillionairesXchange.',
    'fr-FR': 'Bienvenue sur BillionairesXchange, une plateforme permettant de découvrir les marchés numériques et les services financiers. Utilisez le centre de trading et d’investissement pour explorer les marchés crypto, les entreprises et les produits d’investissement disponibles. Examinez chaque possibilité, ses conditions et ses risques avant de prendre une décision. Visitez la boutique pour découvrir des catégories comme les appareils, les jeux vidéo et le matériel de minage de Bitcoin. La section Créer une monnaie propose des outils pour créer et publier une monnaie personnalisée. Dans la section des bots de trading, vous pouvez consulter et configurer des options de trading automatisé. L’automatisation ne garantit aucun résultat ; comprenez les paramètres et les risques avant d’activer un bot. Votre portefeuille regroupe les fonctions de compte et de transaction disponibles. Selon les services activés pour votre compte, vous pouvez déposer ou retirer des fonds, en envoyer, les transférer entre comptes et payer des factures. Vous pouvez également consulter les demandes de carte, les paramètres du compte, les outils de profil et la section À propos et assistance. La disponibilité, les frais et les conditions d’éligibilité peuvent varier selon le service. Prenez le temps d’examiner les détails avant de continuer. Merci de votre visite sur BillionairesXchange.',
    'de-DE': 'Willkommen bei BillionairesXchange, einer Plattform zum Entdecken digitaler Märkte und Finanzdienstleistungen. Im Handels- und Investmentcenter können Sie verfügbare Kryptomärkte, Unternehmen und Anlageprodukte erkunden. Prüfen Sie jede Möglichkeit, ihre Bedingungen und Risiken, bevor Sie eine Entscheidung treffen. Besuchen Sie den Shop und entdecken Sie Kategorien wie Gadgets, Gaming und Bitcoin-Mining-Ausrüstung. Mit Coin erstellen können Sie eigene Coins erstellen und veröffentlichen. Im Bereich Trading-Bot können Sie automatisierte Handelsoptionen prüfen und konfigurieren. Automatisierung garantiert keine Ergebnisse. Machen Sie sich mit den Einstellungen und Risiken vertraut, bevor Sie einen Bot aktivieren. Ihre Wallet bündelt verfügbare Konto- und Transaktionsfunktionen. Je nach den für Ihr Konto aktivierten Diensten können Sie Geld einzahlen oder abheben, senden, zwischen Konten übertragen und Rechnungen bezahlen. Außerdem finden Sie dort Kartenanfragen, Kontoeinstellungen, Profilfunktionen sowie Informationen und Support. Verfügbarkeit, Gebühren und Teilnahmebedingungen können je nach Dienst variieren. Lesen Sie die Details sorgfältig durch, bevor Sie fortfahren. Vielen Dank für Ihren Besuch bei BillionairesXchange.',
    'pt-BR': 'Boas-vindas à BillionairesXchange, uma plataforma para explorar mercados digitais e serviços financeiros. Use a Central de Trading e Investimentos para conhecer os mercados de criptomoedas, as empresas e os produtos de investimento disponíveis. Analise cada oportunidade, suas condições e seus riscos antes de tomar uma decisão. Visite a loja para conferir categorias como dispositivos, jogos e equipamentos de mineração de Bitcoin. A opção Criar Moeda oferece ferramentas para criar e publicar uma moeda personalizada. Na área de Robôs de Trading, você pode consultar e configurar opções de negociação automatizada. A automação não garante resultados; entenda as configurações e os riscos antes de ativar um robô. Sua carteira reúne os recursos disponíveis de conta e transações. Dependendo dos serviços habilitados para sua conta, você pode depositar ou sacar fundos, enviá-los, transferi-los entre contas e pagar contas. Você também pode consultar solicitações de cartão, configurações da conta, ferramentas de perfil e a seção Sobre e Suporte. Disponibilidade, tarifas e requisitos podem variar de acordo com o serviço. Confira os detalhes antes de continuar. Agradecemos por visitar a BillionairesXchange.'
  };
  const femaleVoiceName = /\b(female|zira|samantha|victoria|katherine|susan|hazel|eva|aria|jenny|serena|tessa|fiona|ava|sonia|natasha|joanna|olivia|sara|katja|heda|hedda|helena|laura|paulina|lucia|monica|carmen|amelie|audrey|brigitte|celine|denise|marie|anna|katja|petra|sabina|vicki|siri)\b/i;
  let currentUtterance = null;
  let voicesReady = Boolean(speech && speech.getVoices().length > 0);

  const resetButton = () => {
    overviewButton.setAttribute('aria-pressed', 'false');
    playIcon.textContent = '▶';
    buttonLabel.textContent = 'Listen to platform overview';
  };

  const selectFemaleVoice = (language) => {
    const languageCode = language.split('-')[0];
    return speech.getVoices()
      .filter((voice) => voice.lang.toLowerCase().startsWith(`${languageCode.toLowerCase()}-`))
      .sort((first, second) => Number(second.lang.toLowerCase() === language.toLowerCase()) - Number(first.lang.toLowerCase() === language.toLowerCase()))
      .find((voice) => voice.gender === 'female' || femaleVoiceName.test(voice.name)) || null;
  };

  const updateVoiceStatus = () => {
    const voice = selectFemaleVoice(languageSelect.value);
    overviewButton.disabled = voicesReady && !voice;
    if (voice) {
      overviewStatus.textContent = `Female ${languageSelect.selectedOptions[0].textContent} voice: ${voice.name}.`;
    } else if (voicesReady) {
      overviewStatus.textContent = `No identifiable female voice is available for ${languageSelect.selectedOptions[0].textContent} in this browser. Choose another language.`;
    } else {
      overviewStatus.textContent = 'Loading available female voices...';
    }
  };

  if (!speech || typeof window.SpeechSynthesisUtterance !== 'function') {
    overviewButton.disabled = true;
    overviewStatus.textContent = 'Audio narration is not supported in this browser.';
  } else {
    languageSelect.addEventListener('change', () => {
      if (currentUtterance) {
        speech.cancel();
        currentUtterance = null;
        resetButton();
      }
      updateVoiceStatus();
    });

    overviewButton.addEventListener('click', () => {
      const language = languageSelect.value;
      const voice = selectFemaleVoice(language);
      if (!voice) {
        overviewStatus.textContent = `No identifiable female voice is available for ${languageSelect.selectedOptions[0].textContent} in this browser. Choose another language.`;
        return;
      }

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

      const utterance = new window.SpeechSynthesisUtterance(overviews[language]);
      currentUtterance = utterance;
      utterance.voice = voice;
      utterance.lang = language;
      utterance.pitch = 1.05;
      utterance.rate = 1;
      utterance.onstart = () => {
        playIcon.textContent = '⏸';
        buttonLabel.textContent = 'Pause overview';
        overviewButton.setAttribute('aria-pressed', 'true');
        overviewStatus.textContent = 'Platform overview is playing.';
      };
      utterance.onend = () => {
        if (currentUtterance !== utterance) return;
        currentUtterance = null;
        resetButton();
        overviewStatus.textContent = 'Platform overview finished.';
      };
      utterance.onerror = (event) => {
        if (currentUtterance !== utterance) return;
        currentUtterance = null;
        resetButton();
        overviewStatus.textContent = 'Audio narration could not be played.';
        console.error('Platform overview speech failed:', event.error);
      };
      speech.speak(utterance);
    });

    speech.addEventListener('voiceschanged', () => {
      voicesReady = true;
      updateVoiceStatus();
    });
    updateVoiceStatus();
  }
}
