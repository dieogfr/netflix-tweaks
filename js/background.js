const DEFAULT_PREFERENCES = {
  playbackSpeed: 1,
  skipPreferences: {
    recap: true,
    intro: true,
    credits: true,
  },
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set(DEFAULT_PREFERENCES);
});
