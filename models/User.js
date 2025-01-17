// models/User.js

import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
  walletAddress: { type: String, required: true, unique: true },
  points: { type: Number, default: 0 },
  tier: { type: String, default: 'Bronze' }, // Bronze, Silver, Gold, etc.
  stakedNFTs: [{
    tokenId: { type: Number },
    stakedAt: { type: Date },
  }],
  createdAt: { type: Date, default: Date.now },
});

const User = mongoose.model('User', UserSchema);

export default User;
