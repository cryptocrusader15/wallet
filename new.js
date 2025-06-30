require('dotenv').config();
const Web3 = require('web3');
const fs = require('fs');
const path = require('path');
const { LRUCache } = require('lru-cache');
const { createClient } = require('redis');
const axios = require('axios');


const STATE_FILE = path.join(__dirname, 'state.json');
const CSV_FILE = path.join(__dirname, 'logs.csv');
const POLL_INTERVAL = 2000;
const tokenSymbolCache = {};
const tokenNameCache = {};



// Enhanced WebSocket configuration with BigInt support
const web3 = new Web3(new Web3.providers.WebsocketProvider(
   process.env.NODE_REAL_WSS,
    {
        reconnect: {
            auto: true,
            delay: 5000,
            maxAttempts: Infinity,
            onTimeout: true
        },
        clientConfig: {
            maxReceivedFrameSize: 100000000,      //100MB
            maxReceivedMessageSize: 100000000     //100MB
        }
    }
));

const ERC20_ABI = [
  { constant: true, inputs: [], name: 'name', outputs: [{ name: '', type: 'string' }], type: 'function' },
  { constant: true, inputs: [], name: 'symbol', outputs: [{ name: '', type: 'string' }], type: 'function' },
  { constant: true, inputs: [], name: 'decimals', outputs: [{ name: '', type: 'uint8' }], type: 'function' }
];



// Configuration
const TARGET_WALLETS = process.env.TARGET_WALLETS
  .split(',')
  .map(addr => addr.trim().toLowerCase());


// ========== State Management ==========
    const processedTransactions = new LRUCache({
    max: 5000, // Max number of transaction hashes to keep
    ttl: 1000 * 60 * 2 // 2 minutes TTL per entry
});



let lastProcessedBlock = 0n;


// Load state safely
function loadState() {
    try {
        if (fs.existsSync(STATE_FILE)) {
            const data = fs.readFileSync(STATE_FILE, 'utf8');
            const state = JSON.parse(data);
           processedTransactions.clear();
    
            (state.processedTransactions || []).forEach(tx => processedTransactions.set(tx, true));

          
            return BigInt(state.lastProcessedBlock || 0);
        }
    } catch (e) {
        console.error('State load error:', e.message);
    }
    return 0n;
}

// Save state with error handling
function saveState(blockNumber) {
    try {
        const state = {
            lastProcessedBlock: blockNumber.toString(),
            processedTransactions: Array.from(processedTransactions.keys())
        };
        fs.writeFileSync(STATE_FILE, JSON.stringify(state));
    } catch (e) {
        console.error('State save error:', e.message);
    }
}

// // Create CSV header if file doesn't exist
if (!fs.existsSync(CSV_FILE)) {
    fs.writeFileSync(CSV_FILE, 'Timestamp,Buyer,Token,TokenName,TokenSymbol,PriceUSD,Recipient,TxnHash,DexScreener\n');

}

// Save entry to CSV
function logToCSV(timestamp, buyer, token, tokenName, tokenSymbol, priceUsd, recipient, txHash, dexscreenerUrl) {
    const line = `"${timestamp}","${buyer}","${token}","${tokenName}","${tokenSymbol}","${priceUsd}","${recipient}","${txHash}","${dexscreenerUrl}"\n`;
   fs.appendFile(CSV_FILE, line, err => {
        if (err) console.error('CSV write error:', err.message);
    });
}


// Pad address to 32 bytes
function padAddress(address) {
    return '0x' + address.toLowerCase().replace('0x', '').padStart(64, '0');
}


async function getTokenPrice(tokenAddress) {
    try {
        const { data } = await axios.get(`https://api.dexscreener.com/latest/dex/pairs/bsc/${tokenAddress}`);
        if (data?.pair?.priceUsd) {
            return parseFloat(data.pair.priceUsd).toFixed(6);
        } else {
            return 'N/A';
        }
    } catch (e) {
        console.error(`Price fetch error for ${tokenAddress}:`, e.message);
        return 'N/A';
    }
}


async function getTokenSymbol(tokenAddress) {
    if (tokenSymbolCache[tokenAddress]) return tokenSymbolCache[tokenAddress];
    try {
        const contract = new web3.eth.Contract(ERC20_ABI, tokenAddress);
        const symbol = await contract.methods.symbol().call();
        tokenSymbolCache[tokenAddress] = symbol;
        return symbol;
    } catch (e) {
        console.error(`Failed to fetch symbol for ${tokenAddress}:`, e.message);
        tokenSymbolCache[tokenAddress] = '???';
        return '???';
    }
}


async function getTokenName(tokenAddress) {
    if (tokenNameCache[tokenAddress]) return tokenNameCache[tokenAddress];
    try {
        const contract = new web3.eth.Contract(ERC20_ABI, tokenAddress);
        const name = await contract.methods.name().call();
        tokenNameCache[tokenAddress] = name;
        return name;
    } catch (e) {
        console.error(`Failed to fetch token name for ${tokenAddress}:`, e.message);
        tokenNameCache[tokenAddress] = 'Unknown';
        return 'Unknown';
    }
}


// ========== Main Execution ==========
(async () => {
    console.log(`Starting wallet monitor for ${TARGET_WALLETS.length} addresses`);
    console.log(`Using NodeReal endpoint: ${web3.currentProvider.url}`);

    const latest = BigInt(await web3.eth.getBlockNumber());
    lastProcessedBlock = latest - 3n;
    console.log(`Starting from block ${lastProcessedBlock.toString()}`);

    // Event listeners
    web3.currentProvider.on('connect', () => console.log('WebSocket connected to BSC node'));
    web3.currentProvider.on('error', (error) => console.error('WebSocket error:', error.message));
    web3.currentProvider.on('close', (event) => console.log('WebSocket closed:', event.reason));

    // Create Transfer event filter
    const transferEventSignature = web3.utils.sha3('Transfer(address,address,uint256)');
    const filter = {
        topics: [
            transferEventSignature,
            null,
            TARGET_WALLETS.map(wallet => padAddress(wallet))
        ]
    };

    // Subscribe to Transfer events
    let subscription;
    try {
        subscription = await web3.eth.subscribe('logs', filter);
        console.log('Log subscription active');
    } catch (error) {
        console.error('Subscription failed:', error.message);
        process.exit(1);
    }

    subscription.on('data', async (log) => {
        try {
            if (processedTransactions.has(log.transactionHash)) return;
            processedTransactions.set(log.transactionHash, true); // value doesn't matter, just presence


         if (log.topics.length < 3) return;

        const fromAddress = '0x' + log.topics[1].slice(26).toLowerCase();
        const toAddress = '0x' + log.topics[2].slice(26).toLowerCase();

        // ✅ Check if our target wallet received this token
        if (!TARGET_WALLETS.includes(toAddress)) return;

        // ✅ Ensure we haven’t already processed this tx
        if (processedTransactions.has(log.transactionHash)) return;
        processedTransactions.set(log.transactionHash, true);

        const tx = await web3.eth.getTransaction(log.transactionHash);
        if (!tx || !tx.from) return;
        const tokenName = await getTokenName(log.address);
        const tokenSymbol = await getTokenSymbol(log.address);
        const tokenPrice = await getTokenPrice(log.address);

        const timestamp = new Date().toISOString();
        const dexscreenerUrl = `https://dexscreener.com/bsc/${log.address}`;

        console.log(`\n[${timestamp}] TOKEN BUY DETECTED`);     
        console.log(`Sent From: ${fromAddress}`);
        console.log(`Token Address: ${log.address}`);    
        console.log(`Token Name: ${tokenName}`);
        console.log(`Buyer Wallet: ${toAddress}`);        
        console.log(`Txn: https://bscscan.com/tx/${log.transactionHash}`); 
        console.log(`DexScreener: ${dexscreenerUrl}`);
        console.log('----------------------------------------');

       logToCSV(timestamp, tx.from, log.address, tokenName, tokenSymbol, tokenPrice, toAddress, log.transactionHash, dexscreenerUrl);
    } catch (error) {
        console.error('Log processing error:', error.message);
    }
});

    subscription.on('error', (error) => {
        console.error('Subscription error:', error.message);
    });

    // Block processing for catching up
    const processBlocks = async () => {
        try {
            const currentBlock = BigInt(await web3.eth.getBlockNumber());

            while (lastProcessedBlock < currentBlock) {
                lastProcessedBlock++;
                try {
                    const block = await web3.eth.getBlock(lastProcessedBlock.toString(), false);  // Get block with transaction hashes only
                    if (block && block.transactions) {
                        console.log(`Processing block #${lastProcessedBlock.toString()} (${block.transactions.length} txs)`);

                         // Add all transaction hashes to processed set
                         block.transactions.forEach(txHash => {
                         processedTransactions.set(txHash, true);           
                        });

                  

                    }
                    saveState(lastProcessedBlock);
                } catch (e) {
                    console.error(`Error processing block ${lastProcessedBlock.toString()}:`, e.message);
                    lastProcessedBlock++; // Skip to next block on error
                }
            }
        } catch (e) {
            console.error('Block processing error:', e.message);
        }

        setTimeout(processBlocks, POLL_INTERVAL);
    };

    processBlocks();
    console.log('Monitoring active. Press Ctrl+C to stop.');
})();

// Clean shutdown handler
process.on('SIGINT', () => {
    console.log('\nSaving state and shutting down...');
    saveState(lastProcessedBlock);
    process.exit();
});
