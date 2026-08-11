import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
// The Mise en Place type set, self-hosted (no CDN, so it works on a bad connection):
// Fraunces for headings and the big numbers, Inter Tight for words, JetBrains Mono
// for every figure and micro-label. Latin subsets only — nothing else is ever typed here.
import '@fontsource-variable/fraunces';
import '@fontsource-variable/fraunces/wght-italic.css';
import '@fontsource/inter-tight/latin-500.css';
import '@fontsource/inter-tight/latin-700.css';
import '@fontsource/inter-tight/latin-800.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import '@fontsource/jetbrains-mono/latin-700.css';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
