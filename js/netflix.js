class VideoController {
  static DEFAULT_SPEED = 1;
  static SPEED_LIMITS = { MIN: 0.25, MAX: 10 };
  static SPEED_STEP = 0.25;
  static UPDATE_INTERVAL = 500;
  static SKIP_CHECK_INTERVAL = 1000;
  static SPEED_INDICATOR_TIMEOUT = 2000;

  constructor() {
    this.player = null;
    this.currentSpeed = VideoController.DEFAULT_SPEED;
    this.speedIndicator = null;
    this.intervals = { playback: null, skipCheck: null };

    this.initialize();
    this.loadPreferences();
    this.setupHotkeys();
  }

  async loadPreferences() {
    const { skipPreferences } = await chrome.storage.local
      .get("skipPreferences")
      .catch(() => ({ skipPreferences: { recap: true, intro: true, credits: true } }));
    this.skipPreferences = skipPreferences;
  }

  initialize() {
    new MutationObserver(() => this.findPlayer()).observe(document.body, { childList: true, subtree: true });

    this.findPlayer();
    chrome.storage.onChanged.addListener(({ skipPreferences }) => {
      if (skipPreferences) this.skipPreferences = skipPreferences.newValue;
    });
  }

  createSpeedIndicator() {
    if (this.speedIndicator) return;

    this.speedIndicator = Object.assign(document.createElement("div"), {
      style: `
        position: absolute;
        top: 20px;
        right: 20px;
        background-color: rgba(0, 0, 0, 0.7);
        color: white;
        padding: 5px 10px;
        border-radius: 4px;
        font-size: 16px;
        font-family: system-ui;
        z-index: 9999;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.3s ease;
      `,
      textContent: "x1.00",
    });
  }

  showSpeedIndicator() {
    if (!this.speedIndicator) return;

    this.speedIndicator.style.opacity = "1";
    clearTimeout(this.speedIndicatorTimeout);
    this.speedIndicatorTimeout = setTimeout(() => {
      this.speedIndicator.style.opacity = "0";
    }, VideoController.SPEED_INDICATOR_TIMEOUT);
  }

  findPlayer() {
    const videoElement = document.querySelector('[data-uia="player"] video');
    const playerContainer = document.querySelector('[data-uia="player"]');

    if (videoElement && videoElement !== this.player) {
      this.player = videoElement;
      this.setupPlaybackControl();
      this.startSkipCheck();

      if (playerContainer && !this.speedIndicator) {
        this.createSpeedIndicator();
        playerContainer.appendChild(this.speedIndicator);
      }
    }
  }

  setupPlaybackControl() {
    clearInterval(this.intervals.playback);
    this.intervals.playback = setInterval(async () => {
      if (!this.player) return;

      const { playbackSpeed = VideoController.DEFAULT_SPEED } = await chrome.storage.local
        .get("playbackSpeed")
        .catch(() => ({}));

      if (this.player.playbackRate !== playbackSpeed) {
        this.player.playbackRate = playbackSpeed;
      }
    }, VideoController.UPDATE_INTERVAL);
  }

  startSkipCheck() {
    clearInterval(this.intervals.skipCheck);
    this.intervals.skipCheck = setInterval(() => this.handleSkipButtons(), VideoController.SKIP_CHECK_INTERVAL);
  }

  handleSkipButtons() {
    if (!this.skipPreferences) return;

    const buttonSelectors = {
      recap: '[data-uia="player-skip-recap"]',
      intro: '[data-uia="player-skip-intro"]',
      credits: '[data-uia="next-episode-seamless-button-draining"], [data-uia="next-episode-seamless-button"]',
    };

    Object.entries(buttonSelectors).forEach(([type, selector]) => {
      if (this.skipPreferences[type]) {
        const button = document.querySelector(selector);
        if (button?.dataset.clicked) return;
        button?.click();
        if (button) button.dataset.clicked = "true";
      }
    });
  }

  setupHotkeys() {
    document.addEventListener("keydown", ({ key, shiftKey }) => {
      if (!window.location.hostname.includes("netflix.com") || !shiftKey) return;

      const isSpeedUp = [">", "."].includes(key);
      const isSpeedDown = ["<", ","].includes(key);

      if (isSpeedUp) this.adjustSpeed(VideoController.SPEED_STEP);
      if (isSpeedDown) this.adjustSpeed(-VideoController.SPEED_STEP);
    });
  }

  async adjustSpeed(delta) {
    if (!this.player) return;

    try {
      const { playbackSpeed } = await chrome.storage.local.get("playbackSpeed");
      this.currentSpeed = Number(playbackSpeed) || VideoController.DEFAULT_SPEED;

      const newSpeed = Math.max(
        VideoController.SPEED_LIMITS.MIN,
        Math.min(VideoController.SPEED_LIMITS.MAX, this.currentSpeed + delta)
      );
      const roundedSpeed = Math.round(newSpeed * 100) / 100;

      await chrome.storage.local.set({ playbackSpeed: roundedSpeed });
      this.player.playbackRate = roundedSpeed;

      if (this.speedIndicator) {
        this.speedIndicator.textContent = `x${roundedSpeed}`;
        this.showSpeedIndicator();
      }
    } catch {}
  }

  destroy() {
    Object.values(this.intervals).forEach(clearInterval);
    if (this.speedIndicator) {
      this.speedIndicator.remove();
      this.speedIndicator = null;
    }
  }
}

function initializeController() {
  if (window.videoController) window.videoController.destroy();
  window.videoController = new VideoController();
}

initializeController();
window.addEventListener("load", initializeController);

const originalPushState = window.history.pushState;
window.history.pushState = function (...args) {
  const result = originalPushState.apply(this, args);
  initializeController();
  return result;
};
