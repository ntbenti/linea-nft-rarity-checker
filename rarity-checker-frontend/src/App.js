// src/App.js

import React, { useState } from 'react';
import axios from 'axios';
import './App.css';

function App() {
  const [tokenId, setTokenId] = useState('');
  const [rarity, setRarity] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const checkRarity = async () => {
    if (!tokenId) {
      setError('Please enter a Token ID.');
      setRarity(null);
      return;
    }

    setLoading(true);
    try {
      const response = await axios.get(`http://localhost:3000/rarity/${tokenId}`);
      setRarity(response.data);
      setError('');
    } catch (err) {
      if (err.response && err.response.data && err.response.data.error) {
        setError(err.response.data.error);
      } else {
        setError('An unexpected error occurred.');
      }
      setRarity(null);
    }
    setLoading(false);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    checkRarity();
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>NFT Rarity Checker</h1>
        <form onSubmit={handleSubmit}>
          <input
            type="number"
            value={tokenId}
            onChange={(e) => setTokenId(e.target.value)}
            placeholder="Enter Token ID (1-3333)"
            min="1"
            max="3333"
          />
          <button type="submit" disabled={loading}>
            {loading ? 'Checking...' : 'Check Rarity'}
          </button>
        </form>
        {rarity && (
          <div className="rarity-info">
            <p><strong>Token ID:</strong> {rarity.tokenId}</p>
            <p><strong>Rank:</strong> #{rarity.rank} out of {rarity.total}</p>
          </div>
        )}
        {error && <p className="error">{error}</p>}
      </header>
    </div>
  );
}

export default App;
