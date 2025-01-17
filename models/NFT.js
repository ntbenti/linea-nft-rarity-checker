// models/NFT.js

import mongoose from 'mongoose';

const NFTSchema = new mongoose.Schema({
  tokenId: { type: Number, required: true, unique: true },
  owner: { type: String, required: true },
  tokenURI: { type: String, required: true },
  metadata: { type: Object, required: true },
  traits: [{
    trait_type: { type: String, required: true },
    value: { type: String, required: true },
  }],
  rarityScore: { type: Number, default: 0 },
  rank: { type: Number, default: 0 },
  staked: { type: Boolean, default: false },
  stakedBy: { type: String, default: null }, // User's wallet address
  stakedAt: { type: Date, default: null }, // Timestamp when staked
});

const NFT = mongoose.model('NFT', NFTSchema);

export default NFT;
