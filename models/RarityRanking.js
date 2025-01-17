// models/RarityRanking.js

import mongoose from 'mongoose';

const RarityRankingSchema = new mongoose.Schema({
  tokenId: { type: Number, required: true, unique: true },
  rarityScore: { type: Number, required: true },
  rank: { type: Number, required: true },
});

const RarityRanking = mongoose.model('RarityRanking', RarityRankingSchema);

export default RarityRanking;
