// server.mjs

import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import session from 'express-session';
import * as connectRedis from 'connect-redis';
import Redis from 'ioredis';
import axios from 'axios';
import bodyParser from 'body-parser';
import cron from 'node-cron';
import { ethers } from 'ethers';
import crypto from 'crypto';

// Import Models
import User from './models/User.js';
import NFT from './models/NFT.js';
import RarityRanking from './models/RarityRanking.js';

// Load environment variables from .env file
dotenv.config();

// Access environment variables
const MONGO_URI = process.env.MONGO_URI;
const REDIS_URL = process.env.REDIS_URL;
const SESSION_SECRET = process.env.SESSION_SECRET;
const BACKEND_PORT = process.env.BACKEND_PORT || 4000;

// Initialize Redis client
const redisClient = new Redis(REDIS_URL);

// Initialize Redis store for sessions
const RedisStore = connectRedis(session);

// Initialize Express app
const app = express();

// Middleware configurations
app.use(cors({
  origin: 'http://localhost:3000', // Frontend URL
  credentials: true,
}));
app.use(bodyParser.json());

// Session middleware
app.use(session({
  store: new RedisStore({ client: redisClient }),
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, httpOnly: true, maxAge: 1000 * 60 * 60 * 24 }, // 1 day
}));

// Connect to MongoDB
mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => {
  console.log('Connected to MongoDB');
}).catch((error) => {
  console.error('Error connecting to MongoDB:', error.message);
});

// Function to generate a random nonce
function generateNonce() {
  return crypto.randomBytes(16).toString('hex');
}

// Middleware to check if user is authenticated
function ensureAuthenticated(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  res.status(401).json({ error: 'Unauthorized' });
}

// Endpoint to get a nonce for authentication
app.get('/auth/nonce', async (req, res) => {
  const { walletAddress } = req.query;
  if (!walletAddress) {
    return res.status(400).json({ error: 'Wallet address is required.' });
  }

  try {
    let user = await User.findOne({ walletAddress: walletAddress.toLowerCase() });

    if (!user) {
      // If user doesn't exist, create a new one
      user = new User({ walletAddress: walletAddress.toLowerCase() });
      await user.save();
    }

    // Generate a nonce and store it in Redis with a TTL (e.g., 5 minutes)
    const nonce = generateNonce();
    await redisClient.set(`nonce:${walletAddress.toLowerCase()}`, nonce, 'EX', 300); // 300 seconds = 5 minutes

    res.json({ nonce });
  } catch (error) {
    console.error('Error generating nonce:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Endpoint to verify the signed nonce
app.post('/auth/verify', async (req, res) => {
  const { walletAddress, signature } = req.body;

  if (!walletAddress || !signature) {
    return res.status(400).json({ error: 'Wallet address and signature are required.' });
  }

  try {
    // Retrieve the nonce from Redis
    const nonce = await redisClient.get(`nonce:${walletAddress.toLowerCase()}`);

    if (!nonce) {
      return res.status(400).json({ error: 'Nonce not found or expired.' });
    }

    // Recreate the message that was signed
    const message = `I am signing my one-time nonce: ${nonce}`;

    // Recover the address from the signature
    const recoveredAddress = ethers.utils.verifyMessage(message, signature).toLowerCase();

    if (recoveredAddress !== walletAddress.toLowerCase()) {
      return res.status(400).json({ error: 'Signature verification failed.' });
    }

    // Retrieve the user
    const user = await User.findOne({ walletAddress: walletAddress.toLowerCase() });

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Save user info in session
    req.session.userId = user._id;
    req.session.walletAddress = user.walletAddress;

    // Delete the nonce from Redis as it's no longer needed
    await redisClient.del(`nonce:${walletAddress.toLowerCase()}`);

    res.json({ message: 'Authentication successful.' });
  } catch (error) {
    console.error('Error verifying signature:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Endpoint to logout
app.get('/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Error destroying session:', err);
      return res.status(500).json({ error: 'Could not log out. Please try again.' });
    }
    res.clearCookie('connect.sid'); // Name of the session cookie
    res.json({ message: 'Logged out successfully.' });
  });
});

// Endpoint to get user info
app.get('/api/user', ensureAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId).lean();
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    res.json({ user: {
      walletAddress: user.walletAddress,
      points: user.points,
      tier: user.tier,
      stakedNFTs: user.stakedNFTs,
    } });
  } catch (error) {
    console.error('Error fetching user:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Endpoint to get user's staked NFTs
app.get('/user/staked-nfts', ensureAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId).lean();
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    res.json({ stakedNFTs: user.stakedNFTs, points: user.points, tier: user.tier });
  } catch (error) {
    console.error('Error fetching staked NFTs:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Endpoint to stake an NFT
app.post('/stake', ensureAuthenticated, async (req, res) => {
  const { tokenId } = req.body;
  const userId = req.session.userId;

  if (!tokenId) {
    return res.status(400).json({ error: 'Token ID is required.' });
  }

  try {
    const nft = await NFT.findOne({ tokenId });

    if (!nft) {
      return res.status(404).json({ error: 'NFT not found.' });
    }

    if (nft.staked) {
      return res.status(400).json({ error: 'NFT is already staked.' });
    }

    // Update NFT staking status
    nft.staked = true;
    nft.stakedBy = req.session.walletAddress;
    nft.stakedAt = new Date();
    await nft.save();

    // Update User staking info
    let user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    user.stakedNFTs.push({ tokenId, stakedAt: new Date() });
    await user.save();

    res.json({ message: `NFT #${tokenId} staked successfully.` });
  } catch (error) {
    console.error('Error staking NFT:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Endpoint to unstake an NFT
app.post('/unstake', ensureAuthenticated, async (req, res) => {
  const { tokenId } = req.body;
  const userId = req.session.userId;

  if (!tokenId) {
    return res.status(400).json({ error: 'Token ID is required.' });
  }

  try {
    const nft = await NFT.findOne({ tokenId });

    if (!nft) {
      return res.status(404).json({ error: 'NFT not found.' });
    }

    if (!nft.staked || nft.stakedBy !== req.session.walletAddress) {
      return res.status(400).json({ error: 'NFT is not staked by you.' });
    }

    // Update NFT staking status
    nft.staked = false;
    nft.stakedBy = null;
    nft.stakedAt = null;
    await nft.save();

    // Update User staking info
    let user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    user.stakedNFTs = user.stakedNFTs.filter(nft => nft.tokenId !== tokenId);
    await user.save();

    res.json({ message: `NFT #${tokenId} unstaked successfully.` });
  } catch (error) {
    console.error('Error unstaking NFT:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Endpoint to get top N rare NFTs
app.get('/leaderboard/top-nfts', async (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 10; // Default to top 10
  try {
    const topNFTs = await RarityRanking.find()
      .sort({ rarityScore: -1 }) // Descending order
      .limit(limit)
      .lean(); // Use lean for faster queries as we don't need full Mongoose documents
    res.json({ topNFTs });
  } catch (error) {
    console.error('Error fetching top NFTs:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Endpoint to get top N users by points
app.get('/leaderboard/top-users', async (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 10; // Default to top 10
  try {
    const topUsers = await User.find()
      .sort({ points: -1 }) // Descending order
      .limit(limit)
      .lean(); // Use lean for faster queries
    res.json({ topUsers });
  } catch (error) {
    console.error('Error fetching top users:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Function to update user points and tiers daily
async function updatePoints() {
  console.log('Updating user points...');
  try {
    const users = await User.find({ stakedNFTs: { $exists: true, $not: { $size: 0 } } });

    for (const user of users) {
      let dailyPoints = 0;

      for (const stakedNFT of user.stakedNFTs) {
        const nft = await NFT.findOne({ tokenId: stakedNFT.tokenId });
        if (nft) {
          dailyPoints += 10 * nft.rarityScore; // Base Points × Rarity Boost
        }
      }

      // Apply tier boost
      let tierBoost = 1;
      if (user.tier === 'Silver') tierBoost = 1.5;
      if (user.tier === 'Gold') tierBoost = 2;

      dailyPoints *= tierBoost;

      // Update user points
      user.points += dailyPoints;
      await user.save();

      // Update user tier based on new points and staking volume
      await updateUserTier(user);
    }

    console.log('User points updated successfully.');
  } catch (error) {
    console.error('Error updating points:', error.message);
  }
}

// Function to update user tier based on points and staking volume
async function updateUserTier(user) {
  if (user.points >= 1000 && user.stakedNFTs.length >= 5) {
    user.tier = 'Gold';
  } else if (user.points >= 500 && user.stakedNFTs.length >= 3) {
    user.tier = 'Silver';
  } else {
    user.tier = 'Bronze';
  }
  await user.save();
}

// Schedule the points update to run daily at midnight
cron.schedule('0 0 * * *', () => {
  updatePoints();
});

// Optionally, run the points update once on server start
updatePoints();

// Start the server
app.listen(BACKEND_PORT, () => {
  console.log(`Rarity Checker API is running on http://localhost:${BACKEND_PORT}`);
});
