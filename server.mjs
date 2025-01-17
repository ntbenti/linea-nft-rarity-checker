// server.mjs

import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors'; // Import CORS

// __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths
const rarityDataDir = path.join(__dirname, 'rarity-data');
const nftRarityPath = path.join(rarityDataDir, 'nft-rarity.json');

// Initialize Express
const app = express();
const PORT = 3000;

// Use CORS middleware
app.use(cors());

// Middleware to parse JSON
app.use(express.json());

// Endpoint to get rarity by Token ID
app.get('/rarity/:tokenId', (req, res) => {
    const tokenId = parseInt(req.params.tokenId, 10);
    if (isNaN(tokenId)) {
        return res.status(400).json({ error: 'Invalid Token ID' });
    }

    if (!fs.existsSync(nftRarityPath)) {
        return res.status(500).json({ error: 'Rarity data not found. Please run the main script first.' });
    }

    const rarityData = JSON.parse(fs.readFileSync(nftRarityPath, 'utf-8'));
    const nft = rarityData.find(item => item.tokenId === tokenId);
    if (nft) {
        return res.json({ tokenId: nft.tokenId, rank: nft.rank, total: rarityData.length });
    } else {
        return res.status(404).json({ error: `NFT #${tokenId} not found in rarity rankings.` });
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Rarity Checker API is running on http://localhost:${PORT}`);
});