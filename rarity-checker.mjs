import { ethers } from "ethers";
import fetch from "node-fetch";

// Set up your RPC provider and contract details
const provider = new ethers.JsonRpcProvider("https://linea-mainnet.g.alchemy.com/v2/lwVyN7bqhHAi2ETLGc3lFhkpcA-1YTgh"); // Replace with your RPC URL
const contractAddress = "0x34fb60d16D485cf35637041beF106a7B1EEFAb55"; // Replace with your contract address

// Add the ERC721 ABI for required functions
const abi = [
    "function totalSupply() view returns (uint256)",
    "function tokenURI(uint256 tokenId) view returns (string)",
    "function ownerOf(uint256 tokenId) view returns (address)"
];

// Create the contract instance
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
    try {
        // Verify token existence
        const owner = await contract.ownerOf(tokenId);
        console.log(`Token ID ${tokenId} exists. Owner: ${owner}`);

        // Fetch the token URI
        const tokenURI = await contract.tokenURI(tokenId);
        const updatedTokenURI = replaceIPFS(tokenURI);

        // Fetch metadata from the updated URI
        const metadata = await fetch(updatedTokenURI).then(res => res.json());
        console.log(`Metadata for Token ID ${tokenId}:`, metadata);

        return metadata;
    } catch (error) {
        console.error(`Error fetching Token ID ${tokenId}:`, error.reason || error.message);
        return null;
    }
}

// Main function to fetch metadata for all tokens
async function main() {
    try {
        // Get the total supply of tokens
        const totalSupply = await contract.totalSupply();
        console.log(`Total Supply: ${totalSupply}`);

        // Loop through each token ID and fetch metadata
        for (let tokenId = 0; tokenId < totalSupply; tokenId++) {
            console.log(`Fetching metadata for Token ID: ${tokenId}`);
            await fetchMetadata(tokenId); // Add a delay if necessary to avoid rate limits
        }
    } catch (error) {
        console.error("An error occurred during execution:", error.message);
    }
}

// Execute the main function
main().catch(error => console.error("Unhandled error:", error.message));