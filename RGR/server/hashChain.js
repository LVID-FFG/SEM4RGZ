// server/hashChain.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LAST_HASH_FILE = path.join(__dirname, 'last_hash.txt');
const ROOT_CHECK_INTERVAL = 20;

function getLastHash() {
    try {
        const data = fs.readFileSync(LAST_HASH_FILE, 'utf8').trim();
        return data || 'genesis';
    } catch {
        return 'genesis';
    }
}

function saveLastHash(hash) {
    fs.writeFileSync(LAST_HASH_FILE, hash, 'utf8');
}

function createHashChain(prevHash, userId, action, doorId, details, timestamp) {
    const ts = typeof timestamp === 'string' ? timestamp : timestamp.toISOString();
    const data = `${prevHash}|${ts}|${userId || ''}|${action}|${doorId || ''}|${details || ''}`;
    return crypto.createHash('sha256').update(data).digest('hex');
}

function calculateMerkleRoot(logs) {
    if (logs.length === 0) return null;
    
    let hashes = logs.map(l => l.hash);
    
    while (hashes.length > 1) {
        const newHashes = [];
        for (let i = 0; i < hashes.length; i += 2) {
            if (i + 1 < hashes.length) {
                const combined = hashes[i] + hashes[i + 1];
                newHashes.push(crypto.createHash('sha256').update(combined).digest('hex'));
            } else {
                newHashes.push(hashes[i]);
            }
        }
        hashes = newHashes;
    }
    
    return hashes[0];
}

function verifyHashChain(logs) {
    if (logs.length === 0) return { valid: true, error: null };
    
    let prevHash = 'genesis';
    for (let i = 0; i < logs.length; i++) {
        const log = logs[i];
        const expectedHash = createHashChain(
            prevHash, 
            log.userId, 
            log.action, 
            log.doorId, 
            log.details, 
            log.timestamp
        );
        if (log.hash !== expectedHash) {
            console.error(`[HashChain] Нарушение цепочки на записи ${i}: ${log.id}`);
            return { 
                valid: false, 
                error: `Нарушение цепочки на записи ${i} (ID: ${log.id}, время: ${log.timestamp})`,
                index: i,
                id: log.id,
                timestamp: log.timestamp
            };
        }
        prevHash = log.hash;
    }
    
    const savedLastHash = getLastHash();
    if (prevHash !== savedLastHash) {
        console.error('[HashChain] Последний хеш не совпадает с сохранённым!');
        return { 
            valid: false, 
            error: `Последний хеш не совпадает с сохранённым. Ожидалось: ${savedLastHash}, получено: ${prevHash}`,
            index: -1
        };
    }
    
    return { valid: true, error: null };
}

function updateRootHashIfNeeded(logs, force = false) {
    if (logs.length === 0) return;
    
    if (!force && logs.length % ROOT_CHECK_INTERVAL !== 0) {
        return;
    }
    
    const rootHash = calculateMerkleRoot(logs);
    if (rootHash) {
        try {
            fs.writeFileSync(path.join(__dirname, 'root_hash.txt'), rootHash, 'utf8');
            console.log(`[HashChain] Корневой хеш обновлён (${logs.length} записей)`);
        } catch (err) {
            console.error('[HashChain] Ошибка сохранения корневого хеша:', err);
        }
    }
}

module.exports = { 
    createHashChain, 
    verifyHashChain, 
    getLastHash, 
    saveLastHash, 
    calculateMerkleRoot,
    updateRootHashIfNeeded,
    ROOT_CHECK_INTERVAL
};
