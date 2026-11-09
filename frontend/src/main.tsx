import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { WalletProvider } from './context/WalletContext';
import { MarketProvider } from './context/MarketContext';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <WalletProvider>
      <MarketProvider>
        <App />
      </MarketProvider>
    </WalletProvider>
  </React.StrictMode>
);
