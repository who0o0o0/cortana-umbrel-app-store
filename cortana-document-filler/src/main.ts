import { App } from './App.js';
import './styles.css';

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
  const appContainer = document.getElementById('app');
  if (appContainer) {
    const app = new App(appContainer);
    // Make app globally accessible for bulk mode fix script
    (window as any).app = app;
  } else {
    console.error('App container not found');
  }
});
