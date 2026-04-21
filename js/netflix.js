class VideoController {
  static DEFAULT_SPEED = 1;
  static SPEED_LIMITS = { MIN: 0.25, MAX: 10 };
  static SPEED_STEP = 0.25;
  static SYNC_INTERVAL = 500;
  static SKIP_INTERVAL = 1000;
  static INDICATOR_TIMEOUT = 3000;
  static QUICK_SPEEDS = [0.5, 1, 1.5, 2, 3];

  static SKIP_SELECTORS = {
    recap: '[data-uia="player-skip-recap"]',
    intro: '[data-uia="player-skip-intro"]',
    credits:
      '[data-uia="next-episode-seamless-button-draining"], [data-uia="next-episode-seamless-button"]',
  };

  static INDICATOR_STYLE = `
    backdrop-filter: blur(20px);
    background: rgba(0,0,0,0.8);
    border-radius: 4px;
    color: #fff;
    font-family: "Netflix Sans", system-ui;
    font-size: clamp(16px, -16px + 8vw, 32px);
    font-weight: bold;
    opacity: 0;
    padding: 8px 16px;
    pointer-events: none;
    position: absolute;
    right: 24px;
    top: 24px;
    transition: opacity 0.3s ease-in-out;
    z-index: 9999;
  `;

  #player = null;
  #currentSpeed = VideoController.DEFAULT_SPEED;
  #speedIndicator = null;
  #indicatorTimeout = null;
  #intervals = { sync: null, skip: null };
  #skipPreferences = { recap: true, intro: true, credits: true };
  #observer = null;

  constructor() {
    this.#init();
  }

  async #init() {
    await this.#loadPreferences();
    this.#setupObserver();
    this.#setupHotkeys();
    this.#setupStorageListener();
    this.#findPlayer();
  }

  async #loadPreferences() {
    const stored = await chrome.storage.local
      .get(["skipPreferences", "playbackSpeed"])
      .catch(() => ({}));

    if (stored.skipPreferences) this.#skipPreferences = stored.skipPreferences;
    if (stored.playbackSpeed) this.#currentSpeed = stored.playbackSpeed;
  }

  #setupObserver() {
    this.#observer = new MutationObserver((mutations) => {
      this.#findPlayer();
      this.#handleMenuInjection(mutations);
    });
    this.#observer.observe(document.body, { childList: true, subtree: true });
  }

  #setupStorageListener() {
    chrome.storage.onChanged.addListener(
      ({ skipPreferences, playbackSpeed }) => {
        if (skipPreferences) this.#skipPreferences = skipPreferences.newValue;
        if (playbackSpeed) {
          this.#currentSpeed = playbackSpeed.newValue;
          this.#syncSlider();
        }
      },
    );
  }

  #handleMenuInjection(mutations) {
    const hasRelevantChange = mutations.some((m) =>
      [...m.addedNodes].some((n) => n.nodeType === Node.ELEMENT_NODE),
    );
    if (!hasRelevantChange) return;

    const menu = document.querySelector(
      '[data-uia="playback-speed"]:not([data-injected])',
    );
    if (menu) this.#injectSlider(menu);
  }

  async #injectSlider(menu) {
    menu.dataset.injected = "true";

    const native =
      menu.querySelector(".default-ltr-iqcdef-cache-zjik7") ??
      menu.lastElementChild;
    if (native) native.style.display = "none";

    const wrapper = document.createElement("div");
    wrapper.className = "custom-netflix-slider-wrapper";

    const slider = Object.assign(document.createElement("input"), {
      type: "range",
      min: VideoController.SPEED_LIMITS.MIN,
      max: VideoController.SPEED_LIMITS.MAX,
      step: VideoController.SPEED_STEP,
      value: this.#currentSpeed,
      className: "custom-speed-range",
    });
    slider.addEventListener("input", (e) =>
      this.#setSpeed(parseFloat(e.target.value)),
    );

    const quickButtons = document.createElement("div");
    quickButtons.className = "quick-speed-buttons";
    for (const val of VideoController.QUICK_SPEEDS) {
      const btn = document.createElement("button");
      btn.textContent = `${val}x`;
      btn.onclick = () => {
        slider.value = val;
        this.#setSpeed(val);
      };
      quickButtons.appendChild(btn);
    }

    wrapper.append(slider, quickButtons);
    menu.appendChild(wrapper);
  }

  async #setSpeed(speed) {
    this.#currentSpeed = speed;
    if (this.#player) this.#player.playbackRate = speed;

    await chrome.storage.local.set({ playbackSpeed: speed }).catch(() => {});

    if (this.#speedIndicator) {
      this.#speedIndicator.textContent = `x${speed.toFixed(2)}`;
      this.#showIndicator();
    }
  }

  #syncSlider() {
    const slider = document.querySelector(".custom-speed-range");
    if (slider) slider.value = this.#currentSpeed;
  }

  #createIndicator(container) {
    this.#speedIndicator = Object.assign(document.createElement("div"), {
      className: "custom-speed-indicator",
      style: VideoController.INDICATOR_STYLE,
      textContent: `x${this.#currentSpeed.toFixed(2)}`,
    });
    container.appendChild(this.#speedIndicator);
  }

  #showIndicator() {
    this.#speedIndicator.style.opacity = "1";
    clearTimeout(this.#indicatorTimeout);
    this.#indicatorTimeout = setTimeout(
      () => (this.#speedIndicator.style.opacity = "0"),
      VideoController.INDICATOR_TIMEOUT,
    );
  }

  #findPlayer() {
    const video = document.querySelector('[data-uia="player"] video');
    const container = document.querySelector('[data-uia="player"]');
    if (!video || video === this.#player) return;

    this.#player = video;
    this.#player.playbackRate = this.#currentSpeed;

    this.#startSyncInterval();
    this.#startSkipInterval();

    if (container && !this.#speedIndicator) {
      this.#createIndicator(container);
    }
  }

  #startSyncInterval() {
    clearInterval(this.#intervals.sync);
    this.#intervals.sync = setInterval(() => {
      if (this.#player && this.#player.playbackRate !== this.#currentSpeed) {
        this.#player.playbackRate = this.#currentSpeed;
      }
    }, VideoController.SYNC_INTERVAL);
  }

  #startSkipInterval() {
    clearInterval(this.#intervals.skip);
    this.#intervals.skip = setInterval(
      () => this.#handleSkipButtons(),
      VideoController.SKIP_INTERVAL,
    );
  }

  #handleSkipButtons() {
    for (const [type, selector] of Object.entries(
      VideoController.SKIP_SELECTORS,
    )) {
      if (!this.#skipPreferences[type]) continue;
      const btn = document.querySelector(selector);
      if (!btn || btn.dataset.clicked) continue;
      btn.dataset.clicked = "true";
      btn.click();
    }
  }

  #setupHotkeys() {
    document.addEventListener("keydown", ({ key, shiftKey }) => {
      if (!shiftKey || !window.location.hostname.includes("netflix.com"))
        return;
      if ([">", "."].includes(key))
        this.#adjustSpeed(VideoController.SPEED_STEP);
      if (["<", ","].includes(key))
        this.#adjustSpeed(-VideoController.SPEED_STEP);
    });
  }

  async #adjustSpeed(delta) {
    if (!this.#player) return;
    const clamped = Math.max(
      VideoController.SPEED_LIMITS.MIN,
      Math.min(VideoController.SPEED_LIMITS.MAX, this.#currentSpeed + delta),
    );
    await this.#setSpeed(Math.round(clamped * 100) / 100);
  }

  destroy() {
    Object.values(this.#intervals).forEach(clearInterval);
    this.#observer?.disconnect();
    this.#speedIndicator?.remove();
    this.#speedIndicator = null;
  }
}

function initializeController() {
  window.videoController?.destroy();
  window.videoController = new VideoController();
}

initializeController();

const _pushState = history.pushState.bind(history);
history.pushState = (...args) => {
  _pushState(...args);
  initializeController();
};
