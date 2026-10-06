/**
 * WatchFlow Official Website — Client Logic
 * Minimal, accessible, smooth micro-interactions.
 */

// Isolated Domain Configuration (can be updated for final production domain)
export const CONFIG = {
  GITHUB_REPO: 'https://github.com/manassuryawanshi/watchflow',
  GITHUB_RELEASE: 'https://github.com/manassuryawanshi/watchflow/releases/tag/v1.0.0',
  CHROME_WEB_STORE_URL: '', // Populated once store listing is approved
  SITE_DOMAIN: typeof window !== 'undefined' ? window.location.origin : ''
};

document.addEventListener('DOMContentLoaded', () => {
  // 1. Modal Dialog Logic ("Get WatchFlow")
  const modal = document.getElementById('get-modal');
  const openBtns = document.querySelectorAll('.js-open-get-modal');
  const closeBtn = document.getElementById('modal-close-btn');

  function openModal(e) {
    if (e) e.preventDefault();
    if (modal) {
      modal.classList.add('active');
      document.body.style.overflow = 'hidden';
    }
  }

  function closeModal() {
    if (modal) {
      modal.classList.remove('active');
      document.body.style.overflow = '';
    }
  }

  openBtns.forEach(btn => btn.addEventListener('click', openModal));
  if (closeBtn) closeBtn.addEventListener('click', closeModal);

  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal && modal.classList.contains('active')) {
      closeModal();
    }
  });

  // 2. Smooth Navigation Links
  const navLinks = document.querySelectorAll('a[href^="#"]');
  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      const targetId = link.getAttribute('href');
      if (targetId && targetId !== '#') {
        const targetEl = document.querySelector(targetId);
        if (targetEl) {
          e.preventDefault();
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    });
  });

  // 3. Mobile Navigation Drawer Toggle
  const mobileToggle = document.getElementById('mobile-menu-toggle');
  const navLinksContainer = document.querySelector('.nav-links');

  if (mobileToggle && navLinksContainer) {
    mobileToggle.addEventListener('click', () => {
      const isOpen = navLinksContainer.style.display === 'flex';
      navLinksContainer.style.display = isOpen ? 'none' : 'flex';
      if (!isOpen) {
        navLinksContainer.style.position = 'absolute';
        navLinksContainer.style.top = '64px';
        navLinksContainer.style.left = '0';
        navLinksContainer.style.right = '0';
        navLinksContainer.style.flexDirection = 'column';
        navLinksContainer.style.background = 'rgba(8, 9, 12, 0.98)';
        navLinksContainer.style.padding = '24px';
        navLinksContainer.style.borderBottom = '1px solid var(--border-subtle)';
      }
    });
  }

  // 4. Subtle Parallax / Depth on Mouse Move (Desktop Only, respects prefers-reduced-motion)
  const isReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const heroVisual = document.querySelector('.hero-visual-wrapper');

  if (!isReducedMotion && heroVisual && window.innerWidth > 1024) {
    window.addEventListener('mousemove', (e) => {
      const { clientX, clientY } = e;
      const xPercent = (clientX / window.innerWidth - 0.5) * 2;
      const yPercent = (clientY / window.innerHeight - 0.5) * 2;

      const browser = heroVisual.querySelector('.device-frame-browser');
      const popup = heroVisual.querySelector('.floating-popup-card');

      if (browser) {
        browser.style.transform = `rotateY(${xPercent * 2}deg) rotateX(${-yPercent * 2}deg)`;
      }
      if (popup) {
        popup.style.transform = `translate(${xPercent * -8}px, ${yPercent * -8}px)`;
      }
    });
  }
});
