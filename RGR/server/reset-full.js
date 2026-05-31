const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const { createHashChain, saveLastHash } = require('./hashChain');

const prisma = new PrismaClient();
const LAST_HASH_FILE = path.join(__dirname, 'last_hash.txt');

async function rehashCorrect() {
    console.log('Пересчёт хешей с правильным алгоритмом...');
    
    try {
        // Получаем все логи в порядке возрастания времени
        const logs = await prisma.auditLog.findMany({
            orderBy: { timestamp: 'asc' }
        });
        
        console.log(`Найдено ${logs.length} записей`);
        
        if (logs.length === 0) {
            console.log('Нет записей для пересчёта');
            saveLastHash('genesis');
            return;
        }
        
        let prevHash = 'genesis';
        let errors = 0;
        
        for (let i = 0; i < logs.length; i++) {
            const log = logs[i];
            
            // Пересчитываем хеш с текущим prevHash
            const newHash = createHashChain(
                prevHash,
                log.userId,
                log.action,
                log.doorId,
                log.details,
                log.timestamp
            );
            
            // Обновляем хеш в БД
            await prisma.auditLog.update({
                where: { id: log.id },
                data: { hash: newHash }
            });
            
            // Обновляем prevHash для следующей записи
            prevHash = newHash;
            
            if (i % 10 === 0) {
                console.log(`Обработано ${i + 1} записей`);
            }
        }
        
        // Сохраняем последний хеш
        saveLastHash(prevHash);
        
        console.log('✅ Пересчёт завершён!');
        console.log(`Последний хеш: ${prevHash}`);
        console.log(`Количество записей: ${logs.length}`);
        
        // Проверяем, что все хеши пересчитаны
        const verifyLogs = await prisma.auditLog.findMany({
            orderBy: { timestamp: 'asc' }
        });
        
        let verifyPrevHash = 'genesis';
        let valid = true;
        for (let i = 0; i < verifyLogs.length; i++) {
            const expectedHash = createHashChain(
                verifyPrevHash,
                verifyLogs[i].userId,
                verifyLogs[i].action,
                verifyLogs[i].doorId,
                verifyLogs[i].details,
                verifyLogs[i].timestamp
            );
            if (verifyLogs[i].hash !== expectedHash) {
                console.log(`❌ Ошибка на записи ${i} (ID: ${verifyLogs[i].id})`);
                console.log(`  Ожидалось: ${expectedHash}`);
                console.log(`  Получено: ${verifyLogs[i].hash}`);
                valid = false;
                break;
            }
            verifyPrevHash = verifyLogs[i].hash;
        }
        
        if (valid) {
            console.log('✅ Целостность цепочки подтверждена!');
        } else {
            console.log('❌ Целостность цепочки нарушена!');
        }
    } catch (error) {
        console.error('Ошибка при пересчёте хешей:', error);
    } finally {
        await prisma.$disconnect();
    }
}

rehashCorrect();