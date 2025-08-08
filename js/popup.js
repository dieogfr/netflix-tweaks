const SPEED_CONFIG = {
  min: 0.5,
  max: 10,
  step: 0.25,
  default: 1,
};

class PopupController {
  constructor() {
    this.speedSlider = document.querySelector("#speed");
    this.speedDisplay = document.querySelector('label[for="speed"]');
    this.skipToggles = {
      recap: document.querySelector("#skip-recap"),
      intro: document.querySelector("#skip-intro"),
      credits: document.querySelector("#skip-outro"),
    };

    this.initializeUI();
    this.setupEventListeners();
  }

  updateSpeedUI(value) {
    this.speedDisplay.innerHTML = `Speed: <span>${value}x</span>`;
  }

  async initializeUI() {
    const { playbackSpeed, skipPreferences } = await chrome.storage.local
      .get(["playbackSpeed", "skipPreferences"])
      .catch(() => ({}));

    this.speedSlider.value = Number(playbackSpeed) || SPEED_CONFIG.default;
    this.updateSpeedUI(this.speedSlider.value);

    if (skipPreferences) {
      Object.entries(this.skipToggles).forEach(([key, toggle]) => {
        toggle.checked = skipPreferences[key];
        toggle.disabled = false;
      });
    }
  }

  setupEventListeners() {
    this.speedSlider.addEventListener("input", ({ target: { value } }) => {
      this.updateSpeedUI(value);
      chrome.storage.local.set({ playbackSpeed: value }).catch(() => {});
    });

    Object.entries(this.skipToggles).forEach(([key, toggle]) => {
      toggle.addEventListener("change", async () => {
        const { skipPreferences } = await chrome.storage.local.get("skipPreferences").catch(() => ({}));

        await chrome.storage.local
          .set({
            skipPreferences: { ...skipPreferences, [key]: toggle.checked },
          })
          .catch(() => {});
      });
    });
  }
}

document.addEventListener("DOMContentLoaded", () => new PopupController());
