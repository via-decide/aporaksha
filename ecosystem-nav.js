/**
 * Global Ecosystem Components
 * Injected across LogicHub, Aporaksha, and Daxini Space.
 */

(function initEcosystem() {
  if (document.getElementById('eco-global-header')) return; // Already injected

  const currentDomain = window.location.hostname;
  
  let currentProduct = 'unknown';
  if (currentDomain.includes('logichub')) currentProduct = 'logichub';
  else if (currentDomain.includes('aporaksha')) currentProduct = 'aporaksha';
  else if (currentDomain.includes('daxini.space')) currentProduct = 'daxinispace';
  // Fallback for localhost testing
  else if (window.location.port === '3000' || window.location.pathname.toLowerCase().includes('logichub')) currentProduct = 'logichub';
  else if (window.location.pathname.toLowerCase().includes('aporaksha')) currentProduct = 'aporaksha';
  else currentProduct = 'daxinispace';

  // 1. Inject Stylesheet
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/ecosystem.css'; // Expects ecosystem.css at root of public dir
  document.head.appendChild(link);

  // 2. Build Header
  const header = document.createElement('header');
  header.id = 'eco-global-header';
  header.className = 'eco-global-header';
  header.innerHTML = `
    <div style="font-weight: 700; font-family: 'Space Grotesk', sans-serif; font-size: 16px;">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin-right: 4px;">
        <circle cx="12" cy="12" r="10"></circle>
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
        <path d="M2 12h20"></path>
      </svg>
      DAXINI ECOSYSTEM
    </div>
    <div class="eco-header-links">
      <a href="https://logichub.app" class="eco-header-link ${currentProduct === 'logichub' ? 'active' : ''}">
        LogicHub <span class="eco-header-tag">Build</span>
      </a>
      <a href="https://aporaksha.com" class="eco-header-link ${currentProduct === 'aporaksha' ? 'active' : ''}">
        Aporaksha <span class="eco-header-tag">Identity</span>
      </a>
      <a href="https://daxini.space" class="eco-header-link ${currentProduct === 'daxinispace' ? 'active' : ''}">
        Daxini Space <span class="eco-header-tag">Publish</span>
      </a>
    </div>
    <div>
      <button class="eco-intent-btn" style="padding: 6px 12px; font-size: 12px; border-radius: 6px;" onclick="document.getElementById('eco-modal').classList.add('active')">
        Ecosystem Menu
      </button>
    </div>
  `;

  // 3. Build Personalization Banner
  const banner = document.createElement('div');
  banner.id = 'eco-personalization-banner';
  banner.className = 'eco-personalization-banner';
  banner.style.display = 'flex';
  banner.innerHTML = `✨ Build with <span style="color: #00e5ff; margin: 0 4px;">LogicHub</span> · Own with <span style="color: #ff671f; margin: 0 4px;">Aporaksha</span> · Publish on <span style="color: #00ff96; margin: 0 4px;">Daxini Space</span>`;
  
  // 4. Build Progress Bar
  const progressContainer = document.createElement('div');
  progressContainer.className = 'eco-progress-bar';
  progressContainer.innerHTML = `
    <div class="eco-step ${currentProduct === 'logichub' ? 'active' : ''}">
      [${currentProduct === 'logichub' ? '✓' : ' '}] Build (LogicHub)
    </div>
    <div class="eco-step-arrow">→</div>
    <div class="eco-step ${currentProduct === 'aporaksha' ? 'active' : ''}">
      [${currentProduct === 'aporaksha' ? '✓' : ' '}] Own (Aporaksha)
    </div>
    <div class="eco-step-arrow">→</div>
    <div class="eco-step ${currentProduct === 'daxinispace' ? 'active' : ''}">
      [${currentProduct === 'daxinispace' ? '✓' : ' '}] Publish (Daxini.Space)
    </div>
    <div class="eco-step-arrow">→</div>
    <div class="eco-step">
      [ ] Earn (Marketplace)
    </div>
  `;

  // 5. Build Footer Map
  const footer = document.createElement('footer');
  footer.className = 'eco-global-footer';
  footer.innerHTML = `
    <div class="eco-footer-map">
      <a href="https://logichub.app" class="eco-map-node">
        <span class="eco-map-action">Build</span>
        <span class="eco-map-product">LogicHub</span>
      </a>
      <div class="eco-step-arrow">→</div>
      <a href="https://aporaksha.com" class="eco-map-node">
        <span class="eco-map-action">Own</span>
        <span class="eco-map-product">Aporaksha</span>
      </a>
      <div class="eco-step-arrow">→</div>
      <a href="https://daxini.space" class="eco-map-node">
        <span class="eco-map-action">Publish</span>
        <span class="eco-map-product">Daxini Space</span>
      </a>
      <div class="eco-step-arrow">→</div>
      <div class="eco-map-node" style="opacity:0.5; pointer-events:none;">
        <span class="eco-map-action">Earn</span>
        <span class="eco-map-product">Marketplace</span>
      </div>
    </div>
    <div style="font-size: 11px; color: #8b90a0;">
      © 2026 Daxini Ecosystem. The infrastructure for ownership-first software.
    </div>
  `;

  // 6. Build Onboarding Modal
  const isActivated = localStorage.getItem('onboarding_complete') === 'true' || localStorage.getItem('aporaksha_session');
  const modal = document.createElement('div');
  modal.id = 'eco-modal';
  modal.className = 'eco-modal-overlay';
  modal.innerHTML = `
    <div class="eco-modal">
      <h2>What are you trying to do?</h2>
      <div class="eco-intent-list">
        <button class="eco-intent-btn" onclick="window.location.href='https://logichub.app'">
          Build an App <span>LogicHub</span>
        </button>
        <button class="eco-intent-btn" onclick="window.location.href='https://aporaksha.com'">
          Manage Identity <span>Aporaksha</span>
        </button>
        <button class="eco-intent-btn" onclick="window.location.href='https://daxini.space'">
          Publish Software <span>Daxini Space</span>
        </button>
        ${isActivated 
          ? `<button class="eco-intent-btn" onclick="window.location.href='https://daxini.space/apps/marketplace/'">
               Trade Assets <span>Marketplace</span>
             </button>`
          : `<button class="eco-intent-btn" style="opacity: 0.55; cursor: not-allowed;" title="Unlock after building your first app">
               Trade Assets <span>🔒 Locked</span>
             </button>`
        }
      </div>
      <div style="text-align:center; margin-top: 24px;">
        <a href="#" style="color: #8b90a0; font-size: 12px; text-decoration: none;" onclick="document.getElementById('eco-modal').classList.remove('active'); return false;">Cancel</a>
      </div>
    </div>
  `;

  // Inject into DOM
  document.body.prepend(progressContainer);
  document.body.prepend(banner);
  document.body.prepend(header);
  document.body.appendChild(footer);
  document.body.appendChild(modal);

  // 7. Identity-Backed "Since Last Visit" Logic (Mocked Aporaksha SDK Check)
  function checkIdentityState() {
    const lastVisit = localStorage.getItem('_aporaksha_last_visit');
    const now = Date.now();
    banner.style.display = 'flex';
    banner.innerHTML = `✨ Build with <span style="color: #00e5ff; margin: 0 4px;">LogicHub</span> · Own with <span style="color: #ff671f; margin: 0 4px;">Aporaksha</span> · Publish on <span style="color: #00ff96; margin: 0 4px;">Daxini Space</span>`;
    localStorage.setItem('_aporaksha_last_visit', now.toString());
  }

  // Run identity check
  setTimeout(checkIdentityState, 500);

})();
