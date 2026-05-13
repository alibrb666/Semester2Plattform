import { State } from './state.js';

export const Theme = {
  toggle() {
    this.set(this.get() === 'dark' ? 'light' : 'dark');
  },

  set(theme) {
    const apply = () => document.documentElement.setAttribute('data-theme', theme);
    if (document.startViewTransition) {
      document.startViewTransition(apply);
    } else {
      apply();
    }
    State.updateSettings({ theme });
    document.querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'dark' ? '#08090A' : '#FAFAFA');
  },

  get() {
    return document.documentElement.getAttribute('data-theme') || 'dark';
  }
};
