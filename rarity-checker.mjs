// rarity-checker.mjs

console.log("Rarity Checker Script Started");

import { ethers } from "ethers";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';
import pLimit from "p-limit";
import readlineSync from "readline-sync";
import cliProgress from "cli-progress";

// __dirname is not available in ES modules, so we derive it
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths
const metadataDir = path.join(__dirname, 'metadata');
const rarityDataDir = path.join(__dirname, 'rarity-data');
const traitFrequenciesPath = path.join(rarityDataDir, 'trait-frequencies.json');
const nftRarityPath = path.join(rarityDataDir, 'nft-rarity.json');

// Ensure directories exist
if (!fs.existsSync(metadataDir)) {
    console.log("Creating 'metadata' directory...");
    fs.mkdirSync(metadataDir);
} else {
    console.log("'metadata' directory already exists.");
}

if (!fs.existsSync(rarityDataDir)) {
    console.log("Creating 'rarity-data' directory...");
    fs.mkdirSync(rarityDataDir);
} else {
    console.log("'rarity-data' directory already exists.");
}

// Set up your RPC provider and contract details
console.log("Setting up RPC provider and contract...");
const provider = new ethers.JsonRpcProvider("https://linea-mainnet.g.alchemy.com/v2/lwVyN7bqhHAi2ETLGc3lFhkpcA-1YTgh"); // Replace with your RPC URL
const contractAddress = "0x34fb60d16D485cf35637041beF106a7B1EEFAb55"; // Replace with your contract address

// Add the ERC721 ABI for required functions
const abi = [
    "function totalSupply() view returns (uint256)",
    "function tokenURI(uint256 tokenId) view returns (string)",
    "function ownerOf(uint256 tokenId) view returns (address)"
];

// Create the contract instance
console.log("Creating contract instance...");
const contract = new ethers.Contract(contractAddress, abi, provider);

// Helper function to replace the IPFS gateway
function replaceIPFS(tokenURI) {
    if (tokenURI.startsWith("ipfs://")) {
        return tokenURI.replace("ipfs://", "https://ipfs.io/ipfs/");
    }
    return tokenURI;
}

// Fetch metadata for a specific token ID
async function fetchMetadata(tokenId) {
    console.log(`\nProcessing Token ID ${tokenId}...`);
    const metadataPath = path.join(metadataDir, `${tokenId}.json`);
    
    // Check if metadata already exists
    if (fs.existsSync(metadataPath)) {
        console.log(`Metadata for Token ID ${tokenId} already exists. Skipping fetch.`);
        const data = fs.readFileSync(metadataPath, 'utf-8');
        try {
            return JSON.parse(data);
        } catch (error) {
            console.error(`Error parsing metadata for Token ID ${tokenId}:`, error.message);
            return null;
        }
    }

    try {
        // Verify token existence
        const owner = await contract.ownerOf(tokenId);
        console.log(`Token ID ${tokenId} exists. Owner: ${owner}`);

        // Fetch the token URI
        const tokenURI = await contract.tokenURI(tokenId);
        console.log(`Token URI for Token ID ${tokenId}: ${tokenURI}`);
        const updatedTokenURI = replaceIPFS(tokenURI);
        console.log(`Updated Token URI: ${updatedTokenURI}`);

        // Fetch metadata from the updated URI
        const response = await fetch(updatedTokenURI);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const metadata = await response.json();
        console.log(`Fetched metadata for Token ID ${tokenId}:`, metadata);

        // Save metadata locally
        fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
        console.log(`Metadata for Token ID ${tokenId} saved locally.`);

        return metadata;
    } catch (error) {
        console.error(`Error fetching Token ID ${tokenId}:`, error.reason || error.message);
        return null;
    }
}

// Function to extract traits from metadata
function extractTraits(metadata) {
    // Adjust this function based on your metadata structure
    // Commonly, traits are under an "attributes" array
    if (!metadata || !metadata.attributes) {
        return [];
    }
    return metadata.attributes.map(attr => ({
        trait_type: attr.trait_type,
        value: attr.value
    }));
}

// Calculate trait frequencies
function calculateTraitFrequencies(allTraits) {
    console.log("Calculating trait frequencies...");
    const frequencies = {};

    allTraits.forEach(trait => {
        const { trait_type, value } = trait;
        if (!frequencies[trait_type]) {
            frequencies[trait_type] = {};
        }
        if (!frequencies[trait_type][value]) {
            frequencies[trait_type][value] = 0;
        }
        frequencies[trait_type][value] += 1;
    });

    return frequencies;
}

// Save trait frequencies to a JSON file
function saveTraitFrequencies(frequencies) {
    fs.writeFileSync(traitFrequenciesPath, JSON.stringify(frequencies, null, 2));
    console.log(`Trait frequencies saved to ${traitFrequenciesPath}`);
}

// Calculate rarity score for a single NFT
function calculateRarityScore(traits, frequencies) {
    let score = 0;
    traits.forEach(trait => {
        const { trait_type, value } = trait;
        const frequency = frequencies[trait_type][value] || 1; // Avoid division by zero
        score += 1 / frequency;
    });
    return score;
}

// Calculate and rank rarity for all NFTs
function calculateAndRankRarity(totalSupply, frequencies) {
    console.log("Calculating rarity scores and ranking NFTs...");
    const rarityScores = [];

    for (let tokenId = 1; tokenId <= totalSupply; tokenId++) {
        const metadataPath = path.join(metadataDir, `${tokenId}.json`);
        if (fs.existsSync(metadataPath)) {
            const data = fs.readFileSync(metadataPath, 'utf-8');
            const metadata = JSON.parse(data);
            const traits = extractTraits(metadata);
            const score = calculateRarityScore(traits, frequencies);
            rarityScores.push({ tokenId, score });
        } else {
            console.warn(`Metadata for Token ID ${tokenId} not found. Skipping rarity calculation.`);
        }
    }

    // Sort NFTs by rarity score in descending order (higher score = rarer)
    rarityScores.sort((a, b) => b.score - a.score);

    // Assign ranks
    rarityScores.forEach((item, index) => {
        item.rank = index + 1; // Rank starts at 1
    });

    // Save rarity rankings to a JSON file
    fs.writeFileSync(nftRarityPath, JSON.stringify(rarityScores, null, 2));
    console.log(`NFT rarity rankings saved to ${nftRarityPath}`);
}

// Get rarity rank for a specific token ID
function getRarityRank(tokenId) {
    if (!fs.existsSync(nftRarityPath)) {
        console.error(`Rarity rankings not found. Please run the main script first.`);
        return;
    }

    const rarityData = JSON.parse(fs.readFileSync(nftRarityPath, 'utf-8'));
    const nft = rarityData.find(item => item.tokenId === tokenId);
    if (nft) {
        console.log(`NFT #${tokenId} is ranked #${nft.rank} out of ${rarityData.length}`);
        return nft.rank;
    } else {
        console.log(`NFT #${tokenId} not found in rarity rankings.`);
        return null;
    }
}

// Function to prompt user for token ID and display rarity
function promptRarityLookup() {
    const tokenIdInput = readlineSync.question('Enter the Token ID to check its rarity (or type "exit" to quit): ');
    
    if (tokenIdInput.toLowerCase() === 'exit') {
        console.log('Exiting rarity lookup.');
        process.exit(0);
    }

    const tokenId = parseInt(tokenIdInput, 10);
    if (isNaN(tokenId)) {
        console.log('Invalid Token ID. Please enter a valid number.');
        promptRarityLookup();
    } else {
        getRarityRank(tokenId);
        promptRarityLookup();
    }
}

// Initialize progress bar
const progressBar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);

// Main function to fetch metadata and calculate frequencies
async function main() {
    console.log("Starting main function...");
    try {
        // Get the total supply of tokens
        const totalSupply = Number(await contract.totalSupply());
        console.log(`Total Supply: ${totalSupply}`);
        if (totalSupply === 0) {
            console.log('No tokens found. Exiting.');
            return;
        }

        const allTraits = [];
        const limit = pLimit(5); // Limit to 5 concurrent fetches

        const fetchPromises = [];

        // Initialize progress bar
        progressBar.start(totalSupply, 0);

        // Loop through each token ID and fetch metadata concurrently
        for (let tokenId = 1; tokenId <= totalSupply; tokenId++) {
            fetchPromises.push(limit(async () => {
                const metadata = await fetchMetadata(tokenId);
                if (metadata) {
                    const traits = extractTraits(metadata);
                    allTraits.push(...traits);
                }
                progressBar.increment();
            }));
        }

        // Await all fetches
        await Promise.all(fetchPromises);

        // Stop progress bar
        progressBar.stop();

        // Calculate trait frequencies
        const frequencies = calculateTraitFrequencies(allTraits);
        saveTraitFrequencies(frequencies);

        // Proceed to calculate NFT rarity
        calculateAndRankRarity(totalSupply, frequencies);

        // Start rarity lookup prompt
        promptRarityLookup();
    } catch (error) {
        console.error("An error occurred during execution:", error.message);
        progressBar.stop();
    }
}

// Execute the main function
main().catch(error => console.error("Unhandled error:", error.message));
