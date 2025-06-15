require('dotenv').config();
const Web3 = require('web3');
const fs = require('fs');
const path = require('path');
const LRU = require('lru-cache');
const { LRUCache } = require('lru-cache');

const STATE_FILE = path.join(__dirname, 'state.json');
const CSV_FILE = path.join(__dirname, 'logs.csv');
const POLL_INTERVAL = 2000;


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
    { constant: true, inputs: [], name: 'name', outputs: [{ name: '', type: 'string' }], type: 'function' }
];

const tokenNameCache = {};

// Configuration
const TARGET_WALLETS = process.env.TARGET_WALLETS
  .split(',')
  .map(addr => addr.trim().toLowerCase());
/*const TARGET_WALLETS = [
    '0xd4f96a17ebb66710387e34af033f8bf9c95b501c',
    '0xb6e8d502409b83372293553f97371dd3a13623a5',
    '0x4d364a04f4ddd038e07a7f9c42cd90a09946cb95',
    '0x542a8cc42a1f71013e92df748a7628f884d79d08',
    '0x2998efbe8df42571e0ae2bc8215f8269b0342053'
].map(a => a.toLowerCase());*/

// ========== State Management ==========
//const processedTransactions = new LRU({
    const processedTransactions = new LRUCache({
    max: 5000, // Max number of transaction hashes to keep
    ttl: 1000 * 60 * 2 // 2 minutes TTL per entry
});

/*let processedTransactions = new Map();
const TX_CACHE_TTL = 1000 * 60 * 2; // 2 minutes
*/

let lastProcessedBlock = 0n;

// Cleanup old tx hashes every minute
/*setInterval(() => {
    const now = Date.now();
    for (const [txHash, timestamp] of processedTransactions.entries()) {
        if (now - timestamp > TX_CACHE_TTL) {
            processedTransactions.delete(txHash);
        }
    }
}, 60 * 1000);*/

// Load state safely
function loadState() {
    try {
        if (fs.existsSync(STATE_FILE)) {
            const data = fs.readFileSync(STATE_FILE, 'utf8');
            const state = JSON.parse(data);
            //processedTransactions = new LRU({
                const processedTransactions = new LRUCache({

            max: 5000,
            ttl: 1000 * 60 * 2
            });
            (state.processedTransactions || []).forEach(tx => processedTransactions.set(tx, true));

            /*processedTransactions = new Map(
                (state.processedTransactions || []).map(tx => [tx, Date.now()])
            );*/
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
    fs.writeFileSync(CSV_FILE, 'Timestamp,Buyer,Token,tokenName,Recipient,TxnHash,dexScreener\n');
}

// Save entry to CSV
function logToCSV(timestamp, buyer, token, tokenName, recipient, txHash,) {
    const line = `"${timestamp}","${buyer}","${token}","${tokenName}","${recipient}","${txHash}","${dexscreenerUrl}"\n`;
    fs.appendFile(CSV_FILE, line, err => {
        if (err) console.error('CSV write error:', err.message);
    });
}

// Pad address to 32 bytes
function padAddress(address) {
    return '0x' + address.toLowerCase().replace('0x', '').padStart(64, '0');
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
            /*if (processedTransactions.has(log.transactionHash)) return;
            processedTransactions.set(log.transactionHash, Date.now());*/
            if (processedTransactions.has(log.transactionHash)) return;
            processedTransactions.set(log.transactionHash, true); // value doesn't matter, just presence


            // Extract addresses from log topics
            const fromAddress = '0x' + log.topics[1].slice(26).toLowerCase();
            const toAddress = '0x' + log.topics[2].slice(26).toLowerCase();

            // Get transaction details
            const tx = await web3.eth.getTransaction(log.transactionHash);
            if (!tx || !tx.from) return;

            const isBuy = TARGET_WALLETS.includes(tx.from.toLowerCase()); // Check if this is a buy (sent by the target wallet)

            const isTransferToTarget = TARGET_WALLETS.includes(toAddress); // Check if this is a transfer to a target wallet

            if (isBuy && isTransferToTarget) {
                const tokenName = await getTokenName(log.address);
                const timestamp = new Date().toISOString();
                console.log(`\n[${timestamp}] TOKEN BUY DETECTED`);
                console.log(`Buyer: ${tx.from}`);
                console.log(`Token: ${log.address}`);
                console.log(`Token: ${tokenName}`);
                console.log(`Amount: Received by ${toAddress}`);
                console.log(`Txn: https://bscscan.com/tx/${log.transactionHash}`);
                console.log(`Dex: https://dexscreener.com/bsc/${log.address}`);
                console.log('----------------------------------------');

                logToCSV(timestamp, tx.from, log.address, tokenName, toAddress, log.transactionHash);
            }
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

                       /* block.transactions.forEach(txHash => {
                            processedTransactions.set(txHash, Date.now());
                        });*/

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
