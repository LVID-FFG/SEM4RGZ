const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const svgCaptcha = require('svg-captcha');
const { 
    createHashChain, 
    verifyHashChain, 
    getLastHash, 
    saveLastHash, 
    updateRootHashIfNeeded 
} = require('./hashChain');
const { sendAlertEmail, send2FACode } = require('./emailService');
const prisma = require('./lib/prisma');
const logger = require('./logger');

const app = express();
const PORT = 5000;
const JWT_SECRET = 'super-secret-key-change-in-production-2024';
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';

const refreshTokens = new Set();
const csrfTokens = new Map();
const resetTokens = new Map();
const twoFACodes = new Map();
const captchaStore = new Map();

// ===== Безопасные заголовки через Helmet =====
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https://raw.githubusercontent.com"],
            connectSrc: ["'self'", "http://localhost:5000"],
        },
    },
    crossOriginEmbedderPolicy: false,
}));

// ===== CORS с белым списком =====
const allowedOrigins = ['http://localhost:3000'];
app.use(cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token']
}));

// ===== Парсеры =====
app.use(express.json());
app.use(cookieParser());

// ===== Rate Limiting =====
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: 'Слишком много попыток входа. Попробуйте через 15 минут.',
    skipSuccessfulRequests: true,
});

const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    message: 'Слишком много запросов. Попробуйте позже.',
});

app.use('/api/', apiLimiter);
app.use('/api/login', authLimiter);
app.use('/api/register', authLimiter);

// ===== Проверка подключения к БД =====
async function checkDatabaseConnection() {
    try {
        await prisma.$queryRaw`SELECT 1`;
        logger.info('Подключение к БД успешно');
        return true;
    } catch (error) {
        logger.error('Ошибка подключения к БД:', error);
        return false;
    }
}

// ===== Валидация данных =====
function validateDoorData(data) {
    const errors = [];
    if (!data.name || data.name.trim().length < 2) {
        errors.push('Название двери должно содержать минимум 2 символа');
    }
    if (!data.floor || isNaN(parseInt(data.floor)) || parseInt(data.floor) < 0) {
        errors.push('Этаж должен быть положительным числом');
    }
    if (!data.location || data.location.trim().length < 2) {
        errors.push('Расположение должно содержать минимум 2 символа');
    }
    return errors;
}

function validateUserData(data) {
    const errors = [];
    if (!data.username || data.username.trim().length < 3) {
        errors.push('Логин должен содержать минимум 3 символа');
    }
    if (!data.password || data.password.length < 6) {
        errors.push('Пароль должен содержать минимум 6 символов');
    }
    if (!data.role || !['admin', 'operator', 'auditor'].includes(data.role)) {
        errors.push('Роль должна быть одной из: admin, operator, auditor');
    }
    if (data.email && !data.email.includes('@')) {
        errors.push('Email должен быть валидным');
    }
    return errors;
}

function validateSealOperation(data) {
    const errors = [];
    if (!data.doorId) {
        errors.push('Требуется указать ID двери');
    }
    return errors;
}

// ===== Система прав =====
const PERMISSIONS = {
    admin: {
        doors: ['create', 'read', 'update', 'delete'],
        seals: ['install', 'remove', 'break', 'disable', 'enable', 'read'],
        users: ['create', 'read', 'update', 'delete', 'approve'],
        audit: ['read', 'verify']
    },
    operator: {
        doors: ['read'],
        seals: ['install', 'remove', 'break', 'disable', 'enable', 'read'],
        users: [],
        audit: []
    },
    auditor: {
        doors: ['read'],
        seals: ['read'],
        users: ['read'],
        audit: ['read']
    }
};

function checkPermission(resource, action) {
    return (req, res, next) => {
        if (!req.user) {
            logger.warn('[Auth] Попытка доступа без авторизации', { path: req.path });
            return res.status(401).json({ error: 'Требуется авторизация (401 Unauthorized)' });
        }
        
        const userRole = req.user.role;
        const rolePermissions = PERMISSIONS[userRole];
        
        if (!rolePermissions) {
            logger.warn(`[Auth] Роль не найдена: ${userRole}`);
            return res.status(403).json({ error: 'Доступ запрещён (403 Forbidden)' });
        }
        
        const resourcePermissions = rolePermissions[resource];
        if (!resourcePermissions || !resourcePermissions.includes(action)) {
            logger.warn(`[Auth] Недостаточно прав: ${userRole} пытается выполнить ${action} над ${resource}`);
            return res.status(403).json({ 
                error: 'Недостаточно прав для выполнения действия (403 Forbidden)'
            });
        }
        
        next();
    };
}

// ===== CSRF защита =====
function generateCsrfToken() {
    return crypto.randomBytes(32).toString('hex');
}

function csrfProtection(req, res, next) {
    if (!['POST', 'PUT', 'DELETE'].includes(req.method)) {
        return next();
    }
    
    const csrfTokenFromCookie = req.cookies.csrfToken;
    const csrfTokenFromHeader = req.headers['x-csrf-token'];
    
    if (!csrfTokenFromCookie || !csrfTokenFromHeader) {
        logger.warn('[CSRF] Токен отсутствует', { path: req.path });
        return res.status(403).json({ error: 'Доступ запрещён (403 Forbidden)' });
    }
    
    const storedToken = csrfTokens.get(csrfTokenFromCookie);
    if (!storedToken || storedToken !== csrfTokenFromHeader) {
        logger.warn('[CSRF] Недействительный токен', { path: req.path });
        return res.status(403).json({ error: 'Доступ запрещён (403 Forbidden)' });
    }
    
    next();
}

// ===== Капча =====
app.get('/api/captcha', (req, res) => {
    const captcha = svgCaptcha.create({
        size: 6,
        noise: 3,
        color: true,
        width: 150,
        height: 50
    });
    
    const captchaId = Date.now().toString();
    captchaStore.set(captchaId, {
        text: captcha.text.toLowerCase(),
        expiresAt: Date.now() + 180000
    });
    
    res.type('svg');
    res.json({
        captchaId,
        image: captcha.data
    });
});

function verifyCaptcha(req, res, next) {
    const { captchaId, captchaText } = req.body;
    
    if (!captchaId || !captchaText) {
        logger.warn('[Captcha] Отсутствуют данные капчи');
        return res.status(400).json({ error: 'Неверные данные (400 Bad Request)' });
    }
    
    const storedCaptcha = captchaStore.get(captchaId);
    if (!storedCaptcha) {
        logger.warn('[Captcha] Капча не найдена или уже использована');
        return res.status(400).json({ error: 'Неверные данные (400 Bad Request)' });
    }
    
    if (storedCaptcha.expiresAt < Date.now()) {
        captchaStore.delete(captchaId);
        logger.warn('[Captcha] Капча истекла');
        return res.status(400).json({ error: 'Неверные данные (400 Bad Request)' });
    }
    
    if (storedCaptcha.text !== captchaText.toLowerCase()) {
        captchaStore.delete(captchaId);
        logger.warn('[Captcha] Неверный код капчи');
        return res.status(400).json({ error: 'Неверные данные (400 Bad Request)' });
    }
    
    captchaStore.delete(captchaId);
    next();
}

// ===== 2FA =====
function generate2FACode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// ===== Bootstrap Admin =====
function ensureBootstrapAdmin() {
    prisma.user.findFirst({
        where: {
            role: 'admin',
            approved: true
        }
    }).then(async (admin) => {
        if (admin) {
            return;
        }

        const bootstrapAdmin = await prisma.user.findUnique({
            where: { username: 'bootstrap_admin' }
        });
        if (bootstrapAdmin) {
            return;
        }

        const salt = bcrypt.genSaltSync(10);
        await prisma.user.create({
            data: {
                id: 'bootstrap_' + Date.now().toString(),
                username: 'bootstrap_admin',
                password: bcrypt.hashSync('ChangeMe123!', salt),
                role: 'admin',
                fullName: 'Bootstrap Administrator',
                approved: true
            }
        });
        logger.info('[Server] Bootstrap-админ создан: bootstrap_admin / ChangeMe123!');
    }).catch(err => {
        logger.error('[Server] Ошибка при создании bootstrap-админа:', err);
    });
}

// ===== Аутентификация =====
function authenticateToken(req, res, next) {
    const token = req.cookies.accessToken;
    
    if (!token) {
        logger.warn('[Auth] Попытка доступа без токена', { path: req.path });
        return res.status(401).json({ error: 'Требуется авторизация (401 Unauthorized)' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            logger.warn('[Auth] Недействительный токен', { path: req.path, error: err.message });
            return res.status(403).json({ error: 'Токен недействителен или истёк (403 Forbidden)' });
        }
        req.user = user;
        next();
    });
}

function requireApproved() {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Требуется авторизация (401 Unauthorized)' });
        }
        prisma.user.findUnique({
            where: { id: req.user.id }
        }).then(user => {
            if (!user || !user.approved) {
                logger.warn('[Auth] Неутверждённый пользователь пытается получить доступ', { userId: req.user.id });
                return res.status(403).json({ error: 'Ваша учётная запись ожидает утверждения администратором (403 Forbidden)' });
            }
            next();
        }).catch(err => {
            logger.error('[Server] Ошибка при проверке утверждения:', err);
            res.status(500).json({ error: 'Ошибка сервера (500 Internal Server Error)' });
        });
    };
}

// ===== Аудит =====
async function addAuditLog(userId, userName, action, doorId, details) {
    try {
        const prevHash = getLastHash();
        const timestamp = new Date().toISOString();
        
        const newEntry = {
            id: Date.now().toString(),
            timestamp: timestamp,
            userId: userId,
            userName: userName,
            action: action,
            doorId: doorId || null,
            details: details,
            hash: createHashChain(prevHash, userId, action, doorId, details, timestamp)
        };
        
        // Создаём запись в БД
        await prisma.auditLog.create({
            data: newEntry
        });
        
        // Сохраняем последний хеш
        saveLastHash(newEntry.hash);
        
        // Обновляем корневой хеш
        const allLogs = await prisma.auditLog.findMany({
            orderBy: { timestamp: 'asc' }
        });
        updateRootHashIfNeeded(allLogs);
        
        logger.info(`[Audit] ${action} - ${details}`);
        
        return newEntry;
    } catch (error) {
        logger.error('[Server] Ошибка при добавлении записи в аудит-лог:', error);
        throw error;
    }
}

// ===== API: Аутентификация =====
app.post('/api/login', verifyCaptcha, async (req, res) => {
    const { username, password } = req.body;
    logger.info(`[Auth] Попытка входа: ${username}`);

    if (!username || !password) {
        logger.warn('[Auth] Неполные данные для входа');
        return res.status(400).json({ error: 'Неверные данные (400 Bad Request)' });
    }

    try {
        const user = await prisma.user.findUnique({
            where: { username }
        });

        // 1. Пользователь не найден
        if (!user) {
            logger.warn(`[Auth] Пользователь ${username} не найден`);
            await addAuditLog(null, 'system', 'user_login_failed', null, 
                `Неудачная попытка входа для пользователя "${username}" (пользователь не найден)`);
            return res.status(401).json({ error: 'Неверный логин или пароль (401 Unauthorized)' });
        }

        const isValidPassword = bcrypt.compareSync(password, user.password);

        // 2. Неверный пароль
        if (!isValidPassword) {
            logger.warn(`[Auth] Неверный пароль для ${username}`);
            await addAuditLog(user.id, user.fullName, 'user_login_failed', null, 
                `Неудачная попытка входа для пользователя "${username}" (неверный пароль)`);
            return res.status(401).json({ error: 'Неверный логин или пароль (401 Unauthorized)' });
        }

        // 3. Пользователь не утверждён
        if (!user.approved) {
            logger.warn(`[Auth] Пользователь ${username} не утверждён`);
            await addAuditLog(user.id, user.fullName, 'user_login_failed', null, 
                `Неудачная попытка входа для пользователя "${username}" (не утверждён)`);
            return res.status(403).json({ error: 'Ваша учётная запись ожидает утверждения администратором (403 Forbidden)' });
        }

        // Если 2FA включена
        if (user.twoFactorEnabled) {
            const code = generate2FACode();
            const expiresAt = Date.now() + 300000;
            twoFACodes.set(user.id, { code, expiresAt });
            
            if (user.email) {
                await send2FACode(user.email, code);
            }
            
            // Не логируем как неудачу, так как это часть 2FA
            return res.json({
                requires2FA: true,
                userId: user.id,
                message: 'Требуется код подтверждения. Отправлен на почту.'
            });
        }

        // Успешный вход
        const accessToken = jwt.sign(
            { id: user.id, username: user.username, role: user.role, fullName: user.fullName },
            JWT_SECRET,
            { expiresIn: ACCESS_TOKEN_EXPIRY }
        );

        const refreshToken = jwt.sign(
            { id: user.id },
            JWT_SECRET,
            { expiresIn: REFRESH_TOKEN_EXPIRY }
        );

        refreshTokens.add(refreshToken);

        const csrfToken = generateCsrfToken();
        csrfTokens.set(csrfToken, csrfToken);

        res.cookie('accessToken', accessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 15 * 60 * 1000
        });

        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000
        });

        res.cookie('csrfToken', csrfToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 24 * 60 * 60 * 1000
        });

        // Логирование успешного входа
        await addAuditLog(user.id, user.fullName, 'user_login', null, 
            `Пользователь "${user.username}" вошёл в систему (роль: ${user.role})`);

        logger.info(`[Auth] Успешный вход: ${username} (роль: ${user.role})`);
        res.json({ 
            user: { id: user.id, username: user.username, role: user.role, fullName: user.fullName },
            csrfToken: csrfToken
        });
    } catch (error) {
        logger.error('[Auth] Ошибка при входе:', error);
        res.status(500).json({ error: 'Ошибка сервера (500 Internal Server Error)' });
    }
});

app.post('/api/2fa/verify-code', authenticateToken, async (req, res) => {
    const { code } = req.body;
    
    if (!code) {
        logger.warn('[2FA] Отсутствует код подтверждения');
        return res.status(400).json({ error: 'Неверные данные (400 Bad Request)' });
    }
    
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.id }
        });
        
        if (!user) {
            logger.warn('[2FA] Пользователь не найден');
            return res.status(404).json({ error: 'Пользователь не найден (404 Not Found)' });
        }
        
        const storedCode = twoFACodes.get(user.id);
        if (!storedCode) {
            logger.warn('[2FA] Код не найден или уже использован');
            return res.status(400).json({ error: 'Неверные данные (400 Bad Request)' });
        }
        
        if (storedCode.expiresAt < Date.now()) {
            twoFACodes.delete(user.id);
            logger.warn('[2FA] Код истёк');
            return res.status(400).json({ error: 'Неверные данные (400 Bad Request)' });
        }
        
        if (storedCode.code !== code) {
            logger.warn('[2FA] Неверный код');
            return res.status(400).json({ error: 'Неверные данные (400 Bad Request)' });
        }
        
        twoFACodes.delete(user.id);
        
        const accessToken = jwt.sign(
            { id: user.id, username: user.username, role: user.role, fullName: user.fullName },
            JWT_SECRET,
            { expiresIn: ACCESS_TOKEN_EXPIRY }
        );
        
        const refreshToken = jwt.sign(
            { id: user.id },
            JWT_SECRET,
            { expiresIn: REFRESH_TOKEN_EXPIRY }
        );
        
        refreshTokens.add(refreshToken);
        
        const csrfToken = generateCsrfToken();
        csrfTokens.set(csrfToken, csrfToken);
        
        res.cookie('accessToken', accessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 15 * 60 * 1000
        });
        
        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000
        });
        
        res.cookie('csrfToken', csrfToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 24 * 60 * 60 * 1000
        });
        
        logger.info(`[2FA] Успешная верификация для пользователя ${user.username}`);
        res.json({
            user: { id: user.id, username: user.username, role: user.role, fullName: user.fullName },
            csrfToken
        });
    } catch (error) {
        logger.error('[2FA] Ошибка при проверке кода:', error);
        res.status(500).json({ error: 'Ошибка сервера (500 Internal Server Error)' });
    }
});

app.post('/api/refresh', (req, res) => {
    const refreshToken = req.cookies.refreshToken;

    if (!refreshToken || !refreshTokens.has(refreshToken)) {
        logger.warn('[Auth] Недействительный refresh-токен');
        return res.status(403).json({ error: 'Доступ запрещён (403 Forbidden)' });
    }

    try {
        const decoded = jwt.verify(refreshToken, JWT_SECRET);
        prisma.user.findUnique({
            where: { id: decoded.id }
        }).then(user => {
            if (!user) {
                logger.warn('[Auth] Пользователь не найден');
                return res.status(403).json({ error: 'Доступ запрещён (403 Forbidden)' });
            }

            const newAccessToken = jwt.sign(
                { id: user.id, username: user.username, role: user.role, fullName: user.fullName },
                JWT_SECRET,
                { expiresIn: ACCESS_TOKEN_EXPIRY }
            );

            res.cookie('accessToken', newAccessToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 15 * 60 * 1000
            });

            logger.info('[Auth] Токен обновлён');
            res.json({ success: true });
        }).catch(err => {
            logger.error('[Auth] Ошибка при обновлении токена:', err);
            res.status(500).json({ error: 'Ошибка сервера (500 Internal Server Error)' });
        });
    } catch {
        logger.warn('[Auth] Недействительный refresh-токен');
        return res.status(403).json({ error: 'Доступ запрещён (403 Forbidden)' });
    }
});

app.post('/api/logout', authenticateToken, (req, res) => {
    const refreshToken = req.cookies.refreshToken;
    if (refreshToken) {
        refreshTokens.delete(refreshToken);
        res.clearCookie('refreshToken');
        res.clearCookie('accessToken');
        res.clearCookie('csrfToken');
        logger.info(`[Auth] Пользователь ${req.user.username} вышел`);
    }
    res.json({ success: true });
});

// ===== API: Восстановление пароля =====
app.post('/api/forgot-password', async (req, res) => {
    const { username } = req.body;
    
    if (!username) {
        logger.warn('[Password Reset] Отсутствует логин');
        return res.status(400).json({ error: 'Неверные данные (400 Bad Request)' });
    }
    
    try {
        const user = await prisma.user.findUnique({
            where: { username }
        });
        
        if (!user) {
            logger.warn(`[Password Reset] Пользователь ${username} не найден`);
            return res.json({ success: true, message: 'Если пользователь существует, на его почту будет отправлен код' });
        }
        
        const resetCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        const expiresAt = Date.now() + 3600000;
        
        resetTokens.set(user.id, { code: resetCode, expiresAt });
        
        sendAlertEmail(
            `Код для сброса пароля: ${resetCode}\n\nКод действителен в течение 1 часа.`,
            'medium'
        );
        
        logger.info(`[Password Reset] Код для пользователя ${username}: ${resetCode}`);
        
        res.json({ success: true, message: 'Код отправлен на email' });
    } catch (error) {
        logger.error('[Password Reset] Ошибка:', error);
        res.status(500).json({ error: 'Ошибка сервера (500 Internal Server Error)' });
    }
});

app.post('/api/verify-reset-code', async (req, res) => {
    const { username, code } = req.body;
    
    if (!username || !code) {
        logger.warn('[Password Reset] Отсутствуют данные');
        return res.status(400).json({ error: 'Неверные данные (400 Bad Request)' });
    }
    
    try {
        const user = await prisma.user.findUnique({
            where: { username }
        });
        
        if (!user) {
            logger.warn('[Password Reset] Пользователь не найден');
            return res.status(404).json({ error: 'Пользователь не найден (404 Not Found)' });
        }
        
        const resetData = resetTokens.get(user.id);
        
        if (!resetData) {
            logger.warn('[Password Reset] Код не найден');
            return res.status(400).json({ error: 'Неверные данные (400 Bad Request)' });
        }
        
        if (resetData.expiresAt < Date.now()) {
            resetTokens.delete(user.id);
            logger.warn('[Password Reset] Код истёк');
            return res.status(400).json({ error: 'Неверные данные (400 Bad Request)' });
        }
        
        if (resetData.code !== code) {
            logger.warn('[Password Reset] Неверный код');
            return res.status(400).json({ error: 'Неверные данные (400 Bad Request)' });
        }
        
        logger.info(`[Password Reset] Код подтверждён для ${username}`);
        res.json({ success: true, message: 'Код подтверждён' });
    } catch (error) {
        logger.error('[Password Reset] Ошибка:', error);
        res.status(500).json({ error: 'Ошибка сервера (500 Internal Server Error)' });
    }
});

app.post('/api/reset-password', async (req, res) => {
    const { username, code, newPassword } = req.body;
    
    if (!username || !code || !newPassword) {
        logger.warn('[Password Reset] Отсутствуют данные');
        return res.status(400).json({ error: 'Неверные данные (400 Bad Request)' });
    }
    
    if (newPassword.length < 6) {
        logger.warn('[Password Reset] Пароль слишком короткий');
        return res.status(400).json({ error: 'Неверные данные (400 Bad Request)' });
    }
    
    try {
        const user = await prisma.user.findUnique({
            where: { username }
        });
        
        if (!user) {
            logger.warn('[Password Reset] Пользователь не найден');
            return res.status(404).json({ error: 'Пользователь не найден (404 Not Found)' });
        }
        
        const resetData = resetTokens.get(user.id);
        
        if (!resetData) {
            logger.warn('[Password Reset] Код не найден');
            return res.status(400).json({ error: 'Неверные данные (400 Bad Request)' });
        }
        
        if (resetData.expiresAt < Date.now()) {
            resetTokens.delete(user.id);
            logger.warn('[Password Reset] Код истёк');
            return res.status(400).json({ error: 'Неверные данные (400 Bad Request)' });
        }
        
        if (resetData.code !== code) {
            logger.warn('[Password Reset] Неверный код');
            return res.status(400).json({ error: 'Неверные данные (400 Bad Request)' });
        }
        
        const salt = bcrypt.genSaltSync(10);
        await prisma.user.update({
            where: { id: user.id },
            data: {
                password: bcrypt.hashSync(newPassword, salt)
            }
        });
        
        resetTokens.delete(user.id);
        
        await addAuditLog(null, 'system', 'password_reset', null, 
            `Пароль для пользователя "${username}" был сброшен`);
        
        logger.info(`[Password Reset] Пароль сброшен для ${username}`);
        res.json({ success: true, message: 'Пароль успешно изменён' });
    } catch (error) {
        logger.error('[Password Reset] Ошибка:', error);
        res.status(500).json({ error: 'Ошибка сервера (500 Internal Server Error)' });
    }
});

// ===== API: Регистрация нового пользователя =====
app.post('/api/register', verifyCaptcha, async (req, res) => {
    const { username, email, password, fullName, role } = req.body;
    
    const validationErrors = validateUserData(req.body);
    if (validationErrors.length > 0) {
        logger.warn('[Register] Ошибка валидации:', validationErrors);
        return res.status(400).json({ error: 'Неверные данные (400 Bad Request)' });
    }

    try {
        const existingUser = await prisma.user.findUnique({
            where: { username }
        });
        
        if (existingUser) {
            logger.warn(`[Register] Пользователь ${username} уже существует`);
            return res.status(409).json({ error: 'Пользователь с таким логином уже существует (409 Conflict)' });
        }

        const salt = bcrypt.genSaltSync(10);
        const newUser = await prisma.user.create({
            data: {
                username,
                email: email || null,
                password: bcrypt.hashSync(password, salt),
                role: role,
                fullName: fullName || username,
                approved: false
            }
        });

        await addAuditLog(null, 'system', 'user_registered', null, 
            `Зарегистрирован пользователь "${username}" (роль: ${role}, ожидает утверждения)`);

        sendAlertEmail(
            `Новый пользователь "${username}" зарегистрировался и ожидает утверждения.\nРоль: ${role}`,
            'medium'
        );

        const { password: _, ...safeUser } = newUser;
        logger.info(`[Register] Пользователь ${username} зарегистрирован`);
        res.status(201).json(safeUser);
    } catch (error) {
        logger.error('[Register] Ошибка:', error);
        res.status(500).json({ error: 'Ошибка сервера (500 Internal Server Error)' });
    }
});

// ===== API: Двери =====
app.get('/api/doors', authenticateToken, requireApproved(), checkPermission('doors', 'read'), csrfProtection, async (req, res) => {
    try {
        const doors = await prisma.door.findMany();
        res.json(doors);
    } catch (error) {
        logger.error('[Doors] Ошибка при получении списка:', error);
        res.status(500).json({ error: 'Ошибка сервера (500 Internal Server Error)' });
    }
});

app.get('/api/doors/:id', authenticateToken, requireApproved(), checkPermission('doors', 'read'), csrfProtection, async (req, res) => {
    try {
        const door = await prisma.door.findUnique({
            where: { id: req.params.id }
        });
        if (!door) {
            logger.warn(`[Doors] Дверь с ID ${req.params.id} не найдена`);
            return res.status(404).json({ error: 'Дверь не найдена (404 Not Found)' });
        }
        res.json(door);
    } catch (error) {
        logger.error('[Doors] Ошибка при получении двери:', error);
        res.status(500).json({ error: 'Ошибка сервера (500 Internal Server Error)' });
    }
});

app.post('/api/doors', authenticateToken, requireApproved(), checkPermission('doors', 'create'), csrfProtection, async (req, res) => {
    const { name, floor, location, type, description, responsible, x, y, width, height } = req.body;
    
    const validationErrors = validateDoorData(req.body);
    if (validationErrors.length > 0) {
        logger.warn('[Doors] Ошибка валидации:', validationErrors);
        return res.status(400).json({ error: 'Неверные данные (400 Bad Request)' });
    }
    
    try {
        const newDoor = await prisma.door.create({
            data: {
                name,
                floor: floor || 'Не указан',
                location: location || 'Не указано',
                type: type || 'other',
                description: description || '',
                responsible: responsible || 'Не назначен',
                hasSeal: false,
                x: x || 100,
                y: y || 200,
                width: width || 80,
                height: height || 40
            }
        });
        
        await addAuditLog(req.user.id, req.user.fullName, 'door_created', newDoor.id, 
            `Создана дверь "${newDoor.name}" (${newDoor.location}, этаж ${newDoor.floor})`);
        
        logger.info(`[Doors] Создана дверь "${newDoor.name}"`);
        res.status(201).json(newDoor);
    } catch (error) {
        logger.error('[Doors] Ошибка при создании двери:', error);
        res.status(500).json({ error: 'Ошибка сервера (500 Internal Server Error)' });
    }
});

app.put('/api/doors/:id', authenticateToken, requireApproved(), checkPermission('doors', 'update'), csrfProtection, async (req, res) => {
    const validationErrors = validateDoorData(req.body);
    if (validationErrors.length > 0) {
        logger.warn('[Doors] Ошибка валидации:', validationErrors);
        return res.status(400).json({ error: 'Неверные данные (400 Bad Request)' });
    }
    
    try {
        const existingDoor = await prisma.door.findUnique({
            where: { id: req.params.id }
        });
        if (!existingDoor) {
            logger.warn(`[Doors] Дверь с ID ${req.params.id} не найдена`);
            return res.status(404).json({ error: 'Дверь не найдена (404 Not Found)' });
        }
        
        const updatedDoor = await prisma.door.update({
            where: { id: req.params.id },
            data: req.body
        });
        
        await addAuditLog(req.user.id, req.user.fullName, 'door_updated', req.params.id, 
            `Обновлена дверь "${existingDoor.name}" → "${updatedDoor.name}"`);
        
        logger.info(`[Doors] Обновлена дверь "${existingDoor.name}"`);
        res.json(updatedDoor);
    } catch (error) {
        logger.error('[Doors] Ошибка при обновлении двери:', error);
        res.status(500).json({ error: 'Ошибка сервера (500 Internal Server Error)' });
    }
});

app.delete('/api/doors/:id', authenticateToken, requireApproved(), checkPermission('doors', 'delete'), csrfProtection, async (req, res) => {
    try {
        const existingDoor = await prisma.door.findUnique({
            where: { id: req.params.id }
        });
        if (!existingDoor) {
            logger.warn(`[Doors] Дверь с ID ${req.params.id} не найдена`);
            return res.status(404).json({ error: 'Дверь не найдена (404 Not Found)' });
        }
        
        await prisma.seal.deleteMany({
            where: { doorId: req.params.id }
        });
        
        await prisma.auditLog.deleteMany({
            where: { doorId: req.params.id }
        });
        
        await prisma.door.delete({
            where: { id: req.params.id }
        });
        
        await addAuditLog(req.user.id, req.user.fullName, 'door_deleted', req.params.id, 
            `Удалена дверь "${existingDoor.name}"`);
        
        logger.info(`[Doors] Удалена дверь "${existingDoor.name}"`);
        res.status(204).send();
    } catch (error) {
        logger.error('[Doors] Ошибка при удалении двери:', error);
        res.status(500).json({ error: 'Ошибка сервера (500 Internal Server Error)' });
    }
});

// ===== API: Пломбы =====
app.get('/api/seals', authenticateToken, requireApproved(), checkPermission('seals', 'read'), csrfProtection, async (req, res) => {
    try {
        const seals = await prisma.seal.findMany();
        res.json(seals);
    } catch (error) {
        logger.error('[Seals] Ошибка при получении списка:', error);
        res.status(500).json({ error: 'Ошибка сервера (500 Internal Server Error)' });
    }
});

app.get('/api/seals/:doorId', authenticateToken, requireApproved(), checkPermission('seals', 'read'), csrfProtection, async (req, res) => {
    try {
        const seal = await prisma.seal.findFirst({
            where: { doorId: req.params.doorId }
        });
        if (!seal) {
            logger.warn(`[Seals] Пломба для двери ${req.params.doorId} не найдена`);
            return res.status(404).json({ error: 'Пломба для этой двери не найдена (404 Not Found)' });
        }
        res.json(seal);
    } catch (error) {
        logger.error('[Seals] Ошибка при получении пломбы:', error);
        res.status(500).json({ error: 'Ошибка сервера (500 Internal Server Error)' });
    }
});

app.post('/api/seals/install', authenticateToken, requireApproved(), checkPermission('seals', 'install'), csrfProtection, async (req, res) => {
    const { doorId, sealId } = req.body;
    
    const validationErrors = validateSealOperation(req.body);
    if (validationErrors.length > 0) {
        logger.warn('[Seals] Ошибка валидации:', validationErrors);
        return res.status(400).json({ error: 'Неверные данные (400 Bad Request)' });
    }

    try {
        const door = await prisma.door.findUnique({
            where: { id: doorId }
        });
        if (!door) {
            logger.warn(`[Seals] Дверь с ID ${doorId} не найдена`);
            return res.status(404).json({ error: 'Дверь не найдена (404 Not Found)' });
        }

        const existingSeal = await prisma.seal.findFirst({
            where: { doorId, status: 'installed' }
        });
        if (existingSeal) {
            logger.warn(`[Seals] На двери ${doorId} уже есть пломба`);
            return res.status(409).json({ error: 'На этой двери уже установлена пломба (409 Conflict)' });
        }

        const newSeal = await prisma.seal.create({
            data: {
                id: sealId || Date.now().toString(),
                doorId: doorId,
                installedAt: new Date(),
                status: 'installed',
                installedBy: req.user.id
            }
        });

        await prisma.door.update({
            where: { id: doorId },
            data: { hasSeal: true }
        });

        await addAuditLog(req.user.id, req.user.fullName, 'install_seal', doorId, 
            `Установлена пломба на дверь "${door.name}" (ID пломбы: ${newSeal.id})`);

        logger.info(`[Seals] Установлена пломба на дверь "${door.name}"`);
        res.status(201).json(newSeal);
    } catch (error) {
        logger.error('[Seals] Ошибка при установке пломбы:', error);
        res.status(500).json({ error: 'Ошибка сервера (500 Internal Server Error)' });
    }
});

app.post('/api/seals/remove', authenticateToken, requireApproved(), checkPermission('seals', 'remove'), csrfProtection, async (req, res) => {
    const { doorId } = req.body;
    
    const validationErrors = validateSealOperation(req.body);
    if (validationErrors.length > 0) {
        logger.warn('[Seals] Ошибка валидации:', validationErrors);
        return res.status(400).json({ error: 'Неверные данные (400 Bad Request)' });
    }

    try {
        const door = await prisma.door.findUnique({
            where: { id: doorId }
        });
        if (!door) {
            logger.warn(`[Seals] Дверь с ID ${doorId} не найдена`);
            return res.status(404).json({ error: 'Дверь не найдена (404 Not Found)' });
        }

        const seal = await prisma.seal.findFirst({
            where: { doorId, status: 'installed' }
        });
        if (!seal) {
            logger.warn(`[Seals] На двери ${doorId} нет пломбы`);
            return res.status(404).json({ error: 'На этой двери нет установленной пломбы (404 Not Found)' });
        }

        const updatedSeal = await prisma.seal.update({
            where: { id: seal.id },
            data: {
                status: 'removed',
                removedAt: new Date(),
                removedBy: req.user.id
            }
        });

        await prisma.door.update({
            where: { id: doorId },
            data: { hasSeal: false }
        });

        await addAuditLog(req.user.id, req.user.fullName, 'remove_seal', doorId, 
            `Снята пломба с двери "${door.name}"`);

        logger.info(`[Seals] Снята пломба с двери "${door.name}"`);
        res.json(updatedSeal);
    } catch (error) {
        logger.error('[Seals] Ошибка при снятии пломбы:', error);
        res.status(500).json({ error: 'Ошибка сервера (500 Internal Server Error)' });
    }
});

app.post('/api/seals/break', authenticateToken, requireApproved(), checkPermission('seals', 'break'), csrfProtection, async (req, res) => {
    const { doorId } = req.body;
    
    const validationErrors = validateSealOperation(req.body);
    if (validationErrors.length > 0) {
        logger.warn('[Seals] Ошибка валидации:', validationErrors);
        return res.status(400).json({ error: 'Неверные данные (400 Bad Request)' });
    }

    try {
        const door = await prisma.door.findUnique({
            where: { id: doorId }
        });
        if (!door) {
            logger.warn(`[Seals] Дверь с ID ${doorId} не найдена`);
            return res.status(404).json({ error: 'Дверь не найдена (404 Not Found)' });
        }

        const seal = await prisma.seal.findFirst({
            where: { doorId, status: 'installed' }
        });
        if (!seal) {
            logger.warn(`[Seals] На двери ${doorId} нет пломбы`);
            return res.status(404).json({ error: 'На этой двери нет установленной пломбы (404 Not Found)' });
        }

        const updatedSeal = await prisma.seal.update({
            where: { id: seal.id },
            data: {
                status: 'broken',
                brokenAt: new Date(),
                brokenBy: req.user.id
            }
        });

        await prisma.door.update({
            where: { id: doorId },
            data: { hasSeal: false }
        });

        await addAuditLog(req.user.id, req.user.fullName, 'break_seal', doorId, 
            `Пломба на двери "${door.name}" взломана пользователем ${req.user.fullName} (${req.user.role})`);

        sendAlertEmail(
            `ВНИМАНИЕ! Пломба на двери "${door.name}" была взломана пользователем ${req.user.fullName} (${req.user.role})`,
            'high'
        );

        logger.warn(`[Seals] Пломба на двери "${door.name}" взломана пользователем ${req.user.fullName}`);
        res.json(updatedSeal);
    } catch (error) {
        logger.error('[Seals] Ошибка при взломе пломбы:', error);
        res.status(500).json({ error: 'Ошибка сервера (500 Internal Server Error)' });
    }
});

app.post('/api/seals/disable', authenticateToken, requireApproved(), checkPermission('seals', 'disable'), csrfProtection, async (req, res) => {
    const { doorId } = req.body;
    
    const validationErrors = validateSealOperation(req.body);
    if (validationErrors.length > 0) {
        logger.warn('[Seals] Ошибка валидации:', validationErrors);
        return res.status(400).json({ error: 'Неверные данные (400 Bad Request)' });
    }

    try {
        const door = await prisma.door.findUnique({
            where: { id: doorId }
        });
        if (!door) {
            logger.warn(`[Seals] Дверь с ID ${doorId} не найдена`);
            return res.status(404).json({ error: 'Дверь не найдена (404 Not Found)' });
        }

        const seal = await prisma.seal.findFirst({
            where: { doorId, status: 'installed' }
        });
        if (!seal) {
            logger.warn(`[Seals] На двери ${doorId} нет пломбы`);
            return res.status(404).json({ error: 'На этой двери нет установленной пломбы (404 Not Found)' });
        }

        const updatedSeal = await prisma.seal.update({
            where: { id: seal.id },
            data: {
                status: 'disabled',
                disabledAt: new Date(),
                disabledBy: req.user.id
            }
        });

        await prisma.door.update({
            where: { id: doorId },
            data: { hasSeal: false }
        });

        await addAuditLog(req.user.id, req.user.fullName, 'disable_seal', doorId, 
            `Пломба на двери "${door.name}" отключена пользователем ${req.user.fullName}`);

        logger.info(`[Seals] Пломба на двери "${door.name}" отключена`);
        res.json(updatedSeal);
    } catch (error) {
        logger.error('[Seals] Ошибка при отключении пломбы:', error);
        res.status(500).json({ error: 'Ошибка сервера (500 Internal Server Error)' });
    }
});

app.post('/api/seals/enable', authenticateToken, requireApproved(), checkPermission('seals', 'enable'), csrfProtection, async (req, res) => {
    const { doorId } = req.body;
    
    const validationErrors = validateSealOperation(req.body);
    if (validationErrors.length > 0) {
        logger.warn('[Seals] Ошибка валидации:', validationErrors);
        return res.status(400).json({ error: 'Неверные данные (400 Bad Request)' });
    }

    try {
        const door = await prisma.door.findUnique({
            where: { id: doorId }
        });
        if (!door) {
            logger.warn(`[Seals] Дверь с ID ${doorId} не найдена`);
            return res.status(404).json({ error: 'Дверь не найдена (404 Not Found)' });
        }

        const seal = await prisma.seal.findFirst({
            where: { doorId, status: 'disabled' }
        });
        if (!seal) {
            logger.warn(`[Seals] На двери ${doorId} нет отключённой пломбы`);
            return res.status(404).json({ error: 'На этой двери нет отключённой пломбы (404 Not Found)' });
        }

        const updatedSeal = await prisma.seal.update({
            where: { id: seal.id },
            data: {
                status: 'installed',
                enabledAt: new Date(),
                enabledBy: req.user.id
            }
        });

        await prisma.door.update({
            where: { id: doorId },
            data: { hasSeal: true }
        });

        await addAuditLog(req.user.id, req.user.fullName, 'enable_seal', doorId, 
            `Пломба на двери "${door.name}" включена пользователем ${req.user.fullName}`);

        logger.info(`[Seals] Пломба на двери "${door.name}" включена`);
        res.json(updatedSeal);
    } catch (error) {
        logger.error('[Seals] Ошибка при включении пломбы:', error);
        res.status(500).json({ error: 'Ошибка сервера (500 Internal Server Error)' });
    }
});

// ===== API: Журнал аудита =====
app.get('/api/audit-log', authenticateToken, requireApproved(), checkPermission('audit', 'read'), csrfProtection, async (req, res) => {
    try {
        const logs = await prisma.auditLog.findMany({
            orderBy: { timestamp: 'desc' }
        });
        res.json(logs);
    } catch (error) {
        logger.error('[Audit] Ошибка при получении журнала:', error);
        res.status(500).json({ error: 'Ошибка сервера (500 Internal Server Error)' });
    }
});

app.get('/api/audit-log/verify', authenticateToken, requireApproved(), checkPermission('audit', 'verify'), csrfProtection, async (req, res) => {
    try {
        const logs = await prisma.auditLog.findMany({
            orderBy: { timestamp: 'asc' }
        });
        const result = verifyHashChain(logs);
        res.json(result);
    } catch (error) {
        logger.error('[Audit] Ошибка при проверке цепочки:', error);
        res.status(500).json({ error: 'Ошибка сервера (500 Internal Server Error)' });
    }
});

// ===== API: Пользователи =====
app.get('/api/users', authenticateToken, requireApproved(), checkPermission('users', 'read'), csrfProtection, async (req, res) => {
    try {
        const users = await prisma.user.findMany();
        const safeUsers = users.map(({ password, ...user }) => user);
        res.json(safeUsers);
    } catch (error) {
        logger.error('[Users] Ошибка при получении списка:', error);
        res.status(500).json({ error: 'Ошибка сервера (500 Internal Server Error)' });
    }
});

app.get('/api/users/:id', authenticateToken, requireApproved(), checkPermission('users', 'read'), csrfProtection, async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.params.id }
        });
        if (!user) {
            logger.warn(`[Users] Пользователь с ID ${req.params.id} не найден`);
            return res.status(404).json({ error: 'Пользователь не найден (404 Not Found)' });
        }
        const { password, ...safeUser } = user;
        res.json(safeUser);
    } catch (error) {
        logger.error('[Users] Ошибка при получении пользователя:', error);
        res.status(500).json({ error: 'Ошибка сервера (500 Internal Server Error)' });
    }
});

app.post('/api/users', authenticateToken, requireApproved(), checkPermission('users', 'create'), csrfProtection, async (req, res) => {
    const { username, password, role, fullName } = req.body;
    
    const validationErrors = validateUserData(req.body);
    if (validationErrors.length > 0) {
        logger.warn('[Users] Ошибка валидации:', validationErrors);
        return res.status(400).json({ error: 'Неверные данные (400 Bad Request)' });
    }

    try {
        const existingUser = await prisma.user.findUnique({
            where: { username }
        });
        if (existingUser) {
            logger.warn(`[Users] Пользователь ${username} уже существует`);
            return res.status(409).json({ error: 'Пользователь с таким логином уже существует (409 Conflict)' });
        }

        const salt = bcrypt.genSaltSync(10);
        const newUser = await prisma.user.create({
            data: {
                username,
                password: bcrypt.hashSync(password, salt),
                role,
                fullName: fullName || username,
                approved: false,
                createdBy: req.user.id
            }
        });

        await addAuditLog(req.user.id, req.user.fullName, 'user_created', null, 
            `Создан пользователь "${username}" (роль: ${role}, ожидает утверждения)`);

        sendAlertEmail(
            `Новый пользователь "${username}" ожидает утверждения.\nРоль: ${role}\nСоздан: ${req.user.fullName}`,
            'medium'
        );

        const { password: _, ...safeUser } = newUser;
        logger.info(`[Users] Пользователь ${username} создан`);
        res.status(201).json(safeUser);
    } catch (error) {
        logger.error('[Users] Ошибка при создании пользователя:', error);
        res.status(500).json({ error: 'Ошибка сервера (500 Internal Server Error)' });
    }
});

app.post('/api/users/:id/approve', authenticateToken, requireApproved(), checkPermission('users', 'approve'), csrfProtection, async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.params.id }
        });
        if (!user) {
            logger.warn(`[Users] Пользователь с ID ${req.params.id} не найден`);
            return res.status(404).json({ error: 'Пользователь не найден (404 Not Found)' });
        }
        if (user.approved) {
            logger.warn(`[Users] Пользователь ${user.username} уже утверждён`);
            return res.status(409).json({ error: 'Пользователь уже утверждён (409 Conflict)' });
        }

        const updatedUser = await prisma.user.update({
            where: { id: req.params.id },
            data: { approved: true }
        });

        await addAuditLog(req.user.id, req.user.fullName, 'user_approved', null, 
            `Утверждён пользователь "${user.username}"`);

        const { password: _, ...safeUser } = updatedUser;
        logger.info(`[Users] Пользователь ${user.username} утверждён`);
        res.json({ success: true, user: safeUser });
    } catch (error) {
        logger.error('[Users] Ошибка при утверждении пользователя:', error);
        res.status(500).json({ error: 'Ошибка сервера (500 Internal Server Error)' });
    }
});

app.post('/api/users/:id/2fa/enable', authenticateToken, requireApproved(), checkPermission('users', 'update'), async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.params.id }
        });
        if (!user) {
            logger.warn(`[2FA] Пользователь с ID ${req.params.id} не найден`);
            return res.status(404).json({ error: 'Пользователь не найден (404 Not Found)' });
        }
        await prisma.user.update({
            where: { id: req.params.id },
            data: { twoFactorEnabled: true }
        });
        await addAuditLog(req.user.id, req.user.fullName, '2fa_enabled', null, 
            `2FA включена для пользователя "${user.username}"`);
        logger.info(`[2FA] 2FA включена для пользователя ${user.username}`);
        res.json({ success: true, message: '2FA успешно включена' });
    } catch (error) {
        logger.error('[2FA] Ошибка при включении 2FA:', error);
        res.status(500).json({ error: 'Ошибка сервера (500 Internal Server Error)' });
    }
});

app.post('/api/users/:id/2fa/disable', authenticateToken, requireApproved(), checkPermission('users', 'update'), async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.params.id }
        });
        if (!user) {
            logger.warn(`[2FA] Пользователь с ID ${req.params.id} не найден`);
            return res.status(404).json({ error: 'Пользователь не найден (404 Not Found)' });
        }
        await prisma.user.update({
            where: { id: req.params.id },
            data: { twoFactorEnabled: false }
        });
        await addAuditLog(req.user.id, req.user.fullName, '2fa_disabled', null, 
            `2FA отключена для пользователя "${user.username}"`);
        logger.info(`[2FA] 2FA отключена для пользователя ${user.username}`);
        res.json({ success: true, message: '2FA успешно отключена' });
    } catch (error) {
        logger.error('[2FA] Ошибка при отключении 2FA:', error);
        res.status(500).json({ error: 'Ошибка сервера (500 Internal Server Error)' });
    }
});

app.get('/api/users/:id/2fa/status', authenticateToken, requireApproved(), checkPermission('users', 'read'), async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.params.id },
            select: { id: true, username: true, twoFactorEnabled: true }
        });
        if (!user) {
            logger.warn(`[2FA] Пользователь с ID ${req.params.id} не найден`);
            return res.status(404).json({ error: 'Пользователь не найден (404 Not Found)' });
        }
        res.json(user);
    } catch (error) {
        logger.error('[2FA] Ошибка при получении статуса 2FA:', error);
        res.status(500).json({ error: 'Ошибка сервера (500 Internal Server Error)' });
    }
});

app.delete('/api/users/:id', authenticateToken, requireApproved(), checkPermission('users', 'delete'), csrfProtection, async (req, res) => {
    if (req.params.id === req.user.id) {
        logger.warn('[Users] Попытка удалить самого себя');
        return res.status(400).json({ error: 'Нельзя удалить самого себя (400 Bad Request)' });
    }
    
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.params.id }
        });
        if (!user) {
            logger.warn(`[Users] Пользователь с ID ${req.params.id} не найден`);
            return res.status(404).json({ error: 'Пользователь не найден (404 Not Found)' });
        }

        await prisma.user.delete({
            where: { id: req.params.id }
        });

        await addAuditLog(req.user.id, req.user.fullName, 'user_deleted', null, 
            `Удалён пользователь "${user.username}"`);

        logger.info(`[Users] Пользователь ${user.username} удалён`);
        res.status(204).send();
    } catch (error) {
        logger.error('[Users] Ошибка при удалении пользователя:', error);
        res.status(500).json({ error: 'Ошибка сервера (500 Internal Server Error)' });
    }
});

app.put('/api/users/:id', authenticateToken, requireApproved(), checkPermission('users', 'update'), csrfProtection, async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.params.id }
        });
        if (!user) {
            logger.warn(`[Users] Пользователь с ID ${req.params.id} не найден`);
            return res.status(404).json({ error: 'Пользователь не найден (404 Not Found)' });
        }

        const { password, ...updateData } = req.body;
        const dataToUpdate = { ...updateData };
        if (password) {
            const salt = bcrypt.genSaltSync(10);
            dataToUpdate.password = bcrypt.hashSync(password, salt);
        }

        const updatedUser = await prisma.user.update({
            where: { id: req.params.id },
            data: dataToUpdate
        });

        await addAuditLog(req.user.id, req.user.fullName, 'user_updated', null, 
            `Обновлён пользователь "${user.username}"`);

        const { password: _, ...safeUser } = updatedUser;
        logger.info(`[Users] Пользователь ${user.username} обновлён`);
        res.json(safeUser);
    } catch (error) {
        logger.error('[Users] Ошибка при обновлении пользователя:', error);
        res.status(500).json({ error: 'Ошибка сервера (500 Internal Server Error)' });
    }
});

// ===== Email-уведомления =====
app.post('/api/alert', authenticateToken, requireApproved(), csrfProtection, (req, res) => {
    const { message, severity } = req.body;
    if (!message) {
        logger.warn('[Alert] Отсутствует сообщение');
        return res.status(400).json({ error: 'Неверные данные (400 Bad Request)' });
    }

    sendAlertEmail(message, severity || 'medium')
        .then(() => {
            logger.info(`[Alert] Уведомление отправлено: ${message}`);
            res.json({ success: true });
        })
        .catch(err => {
            logger.error('[Alert] Ошибка отправки уведомления:', err);
            res.status(500).json({ error: 'Ошибка сервера (500 Internal Server Error)' });
        });
});

ensureBootstrapAdmin();
checkDatabaseConnection().then(isConnected => {
    if (!isConnected) {
        logger.error('Не удалось подключиться к БД. Сервер будет работать с ограничениями.');
    }
    app.listen(PORT, () => {
        logger.info(`[Server] Cервер запущен на http://localhost:${PORT}`);
        logger.info(`[Server] Bootstrap-админ: bootstrap_admin / ChangeMe123!`);
        logger.info(`[Server] После создания основного администратора удалите bootstrap-админа через интерфейс.`);
    });
});