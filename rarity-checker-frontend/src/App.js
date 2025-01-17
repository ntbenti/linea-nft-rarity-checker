// src/App.js

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';
import Leaderboard from './Leaderboard';
import UserLeaderboard from './UserLeaderboard';

function App() {
  const [tokenId, setTokenId] = useState('');
  const [rarity, setRarity] = useState(null);
  const [traits, setTraits] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState(null);
  const [stakedNFTs, setStakedNFTs] = useState([]);
  const [points, setPoints] = useState(0);
  const [tier, setTier] = useState('Bronze');

  const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:4000';

  useEffect(() => {
    // Check if user is authenticated
    fetchUser();
  }, []);

  const fetchUser = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/user`, { withCredentials: true });
      setUser(response.data.user);
      if (response.data.user) {
        fetchUserData();
      }
    } catch (error) {
      console.error('Error fetching user:', error);
    }
  };

  const fetchUserData = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/user/staked-nfts`, { withCredentials: true });
      setStakedNFTs(response.data.stakedNFTs);
      setPoints(response.data.points);
      setTier(response.data.tier);
    } catch (error) {
      console.error('Error fetching user data:', error);
    }
  };

  const handleLogin = () => {
    // Prompt user to connect MetaMask and sign nonce
    connectMetaMask();
  };

  const connectMetaMask = async () => {
    if (window.ethereum) {
      try {
        // Request account access
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        const walletAddress = accounts[0].toLowerCase();

        // Get nonce from backend
        const nonceResponse = await axios.get(`${API_BASE_URL}/auth/nonce`, {
          params: { walletAddress },
          withCredentials: true,
        });

        const { nonce } = nonceResponse.data;

        // Sign the nonce using MetaMask
        const signature = await window.ethereum.request({
          method: 'personal_sign',
          params: [nonce, walletAddress],
        });

        // Verify the signature with backend
        const verifyResponse = await axios.post(`${API_BASE_URL}/auth/verify`, { signature }, { withCredentials: true });

        if (verifyResponse.data.message === 'Authentication successful.') {
          setUser(walletAddress);
          fetchUserData();
        }
      } catch (error) {
        console.error('Error during authentication:', error);
        setError('Authentication failed. Please try again.');
      }
    } else {
      alert('MetaMask is not installed. Please install it to use this feature.');
    }
  };

  const handleLogout = async () => {
    try {
      await axios.get(`${API_BASE_URL}/auth/logout`, { withCredentials: true });
      setUser(null);
      setStakedNFTs([]);
      setPoints(0);
      setTier('Bronze');
      alert('Logged out successfully.');
    } catch (error) {
      console.error('Error during logout:', error);
      setError('Logout failed. Please try again.');
    }
  };

  const checkRarity = async () => {
    if (!tokenId) {
      setError('Please enter a Token ID.');
      setRarity(null);
      setTraits([]);
      return;
    }

    setLoading(true);
    try {
      const rarityResponse = await axios.get(`${API_BASE_URL}/rarity/${tokenId}`, { withCredentials: true });
      const nftResponse = await axios.get(`${API_BASE_URL}/nft/${tokenId}`, { withCredentials: true });
      setRarity(rarityResponse.data);
      setTraits(nftResponse.data.traits);
      setError('');
    } catch (err) {
      if (err.response && err.response.data && err.response.data.error) {
        setError(err.response.data.error);
      } else {
        setError('An unexpected error occurred.');
      }
      setRarity(null);
      setTraits([]);
    }
    setLoading(false);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    checkRarity();
  };

  const stakeNFT = async (tokenId) => {
    try {
      await axios.post(`${API_BASE_URL}/stake`, { tokenId }, { withCredentials: true });
      alert(`NFT #${tokenId} staked successfully.`);
      fetchUserData();
    } catch (err) {
      alert(err.response.data.error || 'Failed to stake NFT.');
    }
  };

  const unstakeNFT = async (tokenId) => {
    try {
      await axios.post(`${API_BASE_URL}/unstake`, { tokenId }, { withCredentials: true });
      alert(`NFT #${tokenId} unstaked successfully.`);
      fetchUserData();
    } catch (err) {
      alert(err.response.data.error || 'Failed to unstake NFT.');
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>NFT Rarity Checker</h1>
        {user ? (
          <div>
            <p>Logged in as: {user}</p>
            <button onClick={handleLogout}>Logout</button>
          </div>
        ) : (
          <button onClick={handleLogin}>Login with MetaMask</button>
        )}
        {user && (
          <div className="user-info">
            <h2>Your Points: {points.toFixed(2)}</h2>
            <h3>Tier: {tier}</h3>
            <p>Boost: {tier === 'Bronze' ? '1x' : tier === 'Silver' ? '1.5x' : '2x'}</p>
            <h3>Staked NFTs:</h3>
            {stakedNFTs.length > 0 ? (
              <ul>
                {stakedNFTs.map((nft, index) => (
                  <li key={index}>
                    Token ID: {nft.tokenId} | Staked At: {new Date(nft.stakedAt).toLocaleDateString()}
                    <button onClick={() => unstakeNFT(nft.tokenId)}>Unstake</button>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No NFTs staked.</p>
            )}
          </div>
        )}
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
            <p><strong>Rarity Score:</strong> {rarity.rarityScore.toFixed(4)}</p>
            {!rarity.staked && user && (
              <button onClick={() => stakeNFT(rarity.tokenId)}>Stake NFT</button>
            )}
          </div>
        )}
        {traits.length > 0 && (
          <div className="traits-info">
            <h2>Traits:</h2>
            <ul>
              {traits.map((trait, index) => (
                <li key={index}><strong>{trait.trait_type}:</strong> {trait.value}</li>
              ))}
            </ul>
          </div>
        )}
        {error && (
          <div className="error-info">
            <p className="error">{error}</p>
          </div>
        )}
        <Leaderboard />
        <UserLeaderboard />
      </header>
    </div>
  );
}

export default App;
