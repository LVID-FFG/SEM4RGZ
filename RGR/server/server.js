const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const svgCaptcha = require('svg-captcha');
const path = require('path');
const swaggerUi = require('swagger-ui-express');
const swaggerSpecs = require('./swagger.json');
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
const PORT = 3000;
const JWT_SECRET = 'super-secret-key-change-in-production-2024';
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';

const refreshTokens = new Set();
const csrfTokens = new Map();
const resetTokens = new Map();
const twoFACodes = new Map();
const captchaStore = new Map();

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpecs));
app.use('/api-docs', express.static(path.join(__dirname, 'node_modules/swagger-ui-dist')));

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https://raw.githubusercontent.com"],
            connectSrc: ["'self'", "http://localhost:3000"],
        },
    },
    crossOriginEmbedderPolicy: false,
}));

const allowedOrigins = ['http://147.45.215.184:3001', 'http://localhost:3000'];
app.use(cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token']
}));

app.use(express.json());
app.use(cookieParser());

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
    if (data.password && !/[A-Z]/.test(data.password)) {
        errors.push('Пароль должен содержать хотя бы одну заглавную букву');
    }
    if (data.password && !/[a-z]/.test(data.password)) {
        errors.push('Пароль должен содержать хотя бы одну строчную букву');
    }
    if (data.password && !/[0-9]/.test(data.password)) {
        errors.push('Пароль должен содержать хотя бы одну цифру');
    }
    if (data.password && !/[^A-Za-z0-9]/.test(data.password)) {
        errors.push('Пароль должен содержать хотя бы один специальный символ');
    }
    if (!data.role || !['admin', 'operator', 'auditor'].includes(data.role)) {
        errors.push('Роль должна быть одной из: admin, operator, auditor');
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
        audit: ['read']
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
            return res.status(401).json({ error: 'Требуется авторизация' });
        }
        const userRole = req.user.role;
        const rolePermissions = PERMISSIONS[userRole];
        if (!rolePermissions) {
            logger.warn(`[Auth] Роль не найдена: ${userRole}`);
            return res.status(403).json({ error: 'Доступ запрещён' });
        }
        const resourcePermissions = rolePermissions[resource];
        if (!resourcePermissions || !resourcePermissions.includes(action)) {
            logger.warn(`[Auth] Недостаточно прав: ${userRole} пытается выполнить ${action} над ${resource}`);
            return res.status(403).json({
                error: 'Недостаточно прав для выполнения действия'
            });
        }
        next();
    };
}

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
        return res.status(403).json({ error: 'Доступ запрещён' });
    }
    const storedToken = csrfTokens.get(csrfTokenFromCookie);
    if (!storedToken || storedToken !== csrfTokenFromHeader) {
        logger.warn('[CSRF] Недействительный токен', { path: req.path });
        return res.status(403).json({ error: 'Доступ запрещён' });
    }
    next();
}

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
        return res.status(400).json({ error: 'Неверные данные' });
    }
    const storedCaptcha = captchaStore.get(captchaId);
    if (!storedCaptcha) {
        logger.warn('[Captcha] Капча не найдена');
        return res.status(400).json({ error: 'Неверные данные' });
    }
    if (storedCaptcha.expiresAt < Date.now()) {
        captchaStore.delete(captchaId);
        logger.warn('[Captcha] Капча истекла');
        return res.status(400).json({ error: 'Неверные данные' });
    }
    if (storedCaptcha.text !== captchaText.toLowerCase()) {
        captchaStore.delete(captchaId);
        logger.warn('[Captcha] Неверный код капчи');
        return res.status(400).json({ error: 'Неверные данные' });
    }
    captchaStore.delete(captchaId);
    next();
}

function generate2FACode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

function ensureBootstrapAdmin() {
    prisma.user.findFirst({
        where: { role: 'admin', approved: true }
    }).then(async (admin) => {
        if (admin) return;
        const bootstrapAdmin = await prisma.user.findUnique({
            where: { username: 'bootstrap_admin' }
        });
        if (bootstrapAdmin) return;
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
        logger.info('[Server] Bootstrap-админ создан');
    }).catch(err => {
        logger.error('[Server] Ошибка при создании bootstrap-админа:', err);
    });
}

function authenticateToken(req, res, next) {
    const token = req.cookies.accessToken;
    if (!token) {
        logger.warn('[Auth] Попытка доступа без токена', { path: req.path });
        return res.status(401).json({ error: 'Требуется авторизация' });
    }
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            logger.warn('[Auth] Недействительный токен', { path: req.path });
            return res.status(403).json({ error: 'Токен недействителен' });
        }
        req.user = user;
        next();
    });
}

function requireApproved() {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Требуется авторизация' });
        }
        prisma.user.findUnique({
            where: { id: req.user.id }
        }).then(user => {
            if (!user || !user.approved) {
                logger.warn('[Auth] Неутверждённый пользователь', { userId: req.user.id });
                return res.status(403).json({ error: 'Учётная запись ожидает утверждения' });
            }
            next();
        }).catch(err => {
            logger.error('[Server] Ошибка при проверке утверждения:', err);
            res.status(500).json({ error: 'Ошибка сервера' });
        });
    };
}

async function addAuditLog(userId, userName, action, doorId, doorName, details) {
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
            doorName: doorName || null,
            details: details || null,
            hash: createHashChain(prevHash, userId, action, doorId, details, timestamp)
        };
        await prisma.auditLog.create({ data: newEntry });
        saveLastHash(newEntry.hash);
        const allLogs = await prisma.auditLog.findMany({ orderBy: { timestamp: 'asc' } });
        updateRootHashIfNeeded(allLogs);
        logger.info(`[Audit] ${action} - ${details}`);
        return newEntry;
    } catch (error) {
        logger.error('[Server] Ошибка при добавлении записи в аудит-лог:', error);
        throw error;
    }
}

// ====== AUTH HANDLERS ======
const loginHandler = async (req, res) => {
    const { username, password } = req.body;
    logger.info(`[Auth] Попытка входа: ${username}`);
    if (!username || !password) {
        await addAuditLog(null, 'system', 'user_login_failed', null,
            `Неудачная попытка входа: отсутствуют данные`);
        return res.status(400).json({ error: 'Неверные данные' });
    }
    try {
        const user = await prisma.user.findUnique({ where: { username } });
        if (!user) {
            await addAuditLog(null, 'system', 'user_login_failed', null,
                `Неудачная попытка входа: пользователь "${username}" не найден`);
            return res.status(401).json({ error: 'Неверный логин или пароль' });
        }
        // Проверка, что пользователь не удалён
        if (user.isDeleted) {
            await addAuditLog(user.id, user.username, 'user_login_failed', null,
                `Попытка входа удалённого пользователя "${user.username}"`);
            return res.status(401).json({ error: 'Пользователь удалён' });
        }
        const isValidPassword = bcrypt.compareSync(password, user.password);
        if (!isValidPassword) {
            await addAuditLog(user.id, user.username, 'user_login_failed', null,
                `Неудачная попытка входа: неверный пароль`);
            return res.status(401).json({ error: 'Неверный логин или пароль' });
        }
        if (!user.approved) {
            await addAuditLog(user.id, user.username, 'user_login_failed', null,
                `Неудачная попытка входа: пользователь не утверждён`);
            return res.status(403).json({ error: 'Учётная запись ожидает утверждения' });
        }
        if (user.twoFactorEnabled) {
            const code = generate2FACode();
            const expiresAt = Date.now() + 300000;
            twoFACodes.set(user.id, { code, expiresAt });
            if (user.email) {
                await send2FACode(user.email, code);
            }
            await addAuditLog(user.id, user.username, 'user_login', null,
                `Успешный вход (требуется 2FA)`);
            return res.json({
                requires2FA: true,
                userId: user.id,
                message: 'Требуется код подтверждения'
            });
        }
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
            secure: false,
            sameSite: 'strict',
            maxAge: 15 * 60 * 1000
        });
        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: false,
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000
        });
        res.cookie('csrfToken', csrfToken, {
            httpOnly: true,
            secure: false,
            sameSite: 'strict',
            maxAge: 24 * 60 * 60 * 1000
        });
        logger.info(`[Auth] Успешный вход: ${username}`);
        if (user.role === 'admin') {
            await sendAlertEmail(
                `Вход в админку: пользователь ${user.username} вошёл в систему`,
                'medium'
            );
        }
        await addAuditLog(user.id, user.username, 'user_login', null,
            `Успешный вход в систему`);
        res.json({
            user: { id: user.id, username: user.username, role: user.role, fullName: user.fullName },
            csrfToken
        });
    } catch (error) {
        logger.error('[Auth] Ошибка при входе:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
}; 

const twoFAVerifyHandler = async (req, res) => {
    const { userId, code } = req.body;
    if (!userId || !code) {
        return res.status(400).json({ error: 'Неверные данные' });
    }
    try {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        const storedCode = twoFACodes.get(user.id);
        if (!storedCode) {
            return res.status(400).json({ error: 'Код не найден или уже использован' });
        }
        if (storedCode.expiresAt < Date.now()) {
            twoFACodes.delete(user.id);
            return res.status(400).json({ error: 'Код истёк' });
        }
        if (storedCode.code !== code) {
            return res.status(400).json({ error: 'Неверный код' });
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
            secure: false,
            sameSite: 'strict',
            maxAge: 15 * 60 * 1000
        });
        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: false,
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000
        });
        res.cookie('csrfToken', csrfToken, {
            httpOnly: true,
            secure: false,
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
        res.status(500).json({ error: 'Ошибка сервера' });
    }
};

const registerHandler = async (req, res) => {
    const { username, email, password, fullName, role } = req.body;
    const validationErrors = validateUserData(req.body);
    if (validationErrors.length > 0) {
        return res.status(400).json({ error: 'Неверные данные' });
    }
    try {
        const existingUser = await prisma.user.findUnique({ where: { username } });
        if (existingUser) {
            return res.status(409).json({ error: 'Пользователь с таким логином уже существует' });
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
        await addAuditLog(null, 'system', 'user_registered', null, null,
            `Зарегистрирован пользователь "${username}"`);
        sendAlertEmail(
            `Новый пользователь "${username}" зарегистрировался и ожидает утверждения`,
            'medium'
        );
        const { password: _, ...safeUser } = newUser;
        res.status(201).json(safeUser);
    } catch (error) {
        logger.error('[Register] Ошибка:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
};

const refreshHandler = (req, res) => {
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken || !refreshTokens.has(refreshToken)) {
        return res.status(403).json({ error: 'Доступ запрещён' });
    }
    try {
        const decoded = jwt.verify(refreshToken, JWT_SECRET);
        prisma.user.findUnique({ where: { id: decoded.id } }).then(user => {
            if (!user) {
                return res.status(403).json({ error: 'Доступ запрещён' });
            }
            const newAccessToken = jwt.sign(
                { id: user.id, username: user.username, role: user.role, fullName: user.fullName },
                JWT_SECRET,
                { expiresIn: ACCESS_TOKEN_EXPIRY }
            );
            res.cookie('accessToken', newAccessToken, {
                httpOnly: true,
                secure: false,
                sameSite: 'strict',
                maxAge: 15 * 60 * 1000
            });
            res.json({ success: true });
        }).catch(err => {
            logger.error('[Auth] Ошибка при обновлении токена:', err);
            res.status(500).json({ error: 'Ошибка сервера' });
        });
    } catch {
        return res.status(403).json({ error: 'Доступ запрещён' });
    }
};

const logoutHandler = (req, res) => {
    const refreshToken = req.cookies.refreshToken;
    if (refreshToken) {
        refreshTokens.delete(refreshToken);
        res.clearCookie('refreshToken');
        res.clearCookie('accessToken');
        res.clearCookie('csrfToken');
        logger.info(`[Auth] Пользователь ${req.user.username} вышел`);
    }
    res.json({ success: true });
};

const forgotPasswordHandler = async (req, res) => {
    const { username } = req.body;
    if (!username) {
        return res.status(400).json({ error: 'Неверные данные' });
    }
    try {
        const user = await prisma.user.findUnique({ where: { username } });
        if (!user) {
            return res.json({ success: true, message: 'Код отправлен на email' });
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
        res.status(500).json({ error: 'Ошибка сервера' });
    }
};

const resetPasswordHandler = async (req, res) => {
    const { username, code, newPassword } = req.body;
    if (!username || !code || !newPassword) {
        return res.status(400).json({ error: 'Неверные данные' });
    }
    const validationErrors = validateUserData({ username, password: newPassword, role: 'operator' });
    if (validationErrors.length > 0) {
        return res.status(400).json({ error: validationErrors[0] });
    }
    if (newPassword.length < 6) {
        return res.status(400).json({ error: 'Пароль должен содержать минимум 6 символов' });
    }
    try {
        const user = await prisma.user.findUnique({ where: { username } });
        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        const resetData = resetTokens.get(user.id);
        if (!resetData) {
            return res.status(400).json({ error: 'Код не найден или уже использован' });
        }
        if (resetData.expiresAt < Date.now()) {
            resetTokens.delete(user.id);
            return res.status(400).json({ error: 'Код истёк' });
        }
        if (resetData.code !== code) {
            return res.status(400).json({ error: 'Неверный код' });
        }
        const salt = bcrypt.genSaltSync(10);
        await prisma.user.update({
            where: { id: user.id },
            data: { password: bcrypt.hashSync(newPassword, salt) }
        });
        resetTokens.delete(user.id);
        await addAuditLog(null, 'system', 'password_reset', null, null,
            `Пароль для пользователя "${username}" был сброшен`);
        res.json({ success: true, message: 'Пароль успешно изменён' });
    } catch (error) {
        logger.error('[Password Reset] Ошибка:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
};

// ====== DOOR HANDLERS ======
const getDoorsHandler = async (req, res) => {
    try {
        const doors = await prisma.door.findMany({
            where: { isDeleted: false }
        });
        res.json(doors);
    } catch (error) {
        logger.error('[Doors] Ошибка при получении списка:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
};

const getDoorByIdHandler = async (req, res) => {
    try {
        const door = await prisma.door.findUnique({ where: { id: req.params.id } });
        if (!door) {
            return res.status(404).json({ error: 'Дверь не найдена' });
        }
        res.json(door);
    } catch (error) {
        logger.error('[Doors] Ошибка при получении двери:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
};

const createDoorHandler = async (req, res) => {
    const { name, floor, location, type, description, responsible, x, y, width, height } = req.body;
    const validationErrors = validateDoorData(req.body);
    if (validationErrors.length > 0) {
        return res.status(400).json({ error: 'Неверные данные' });
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
        await addAuditLog(req.user.id, req.user.fullName, 'door_created', newDoor.id, newDoor.name,
            `Создана дверь "${newDoor.name}"`);
        res.status(201).json(newDoor);
    } catch (error) {
        logger.error('[Doors] Ошибка при создании двери:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
};

const updateDoorHandler = async (req, res) => {
    const validationErrors = validateDoorData(req.body);
    if (validationErrors.length > 0) {
        return res.status(400).json({ error: 'Неверные данные' });
    }
    try {
        const existingDoor = await prisma.door.findUnique({ where: { id: req.params.id } });
        if (!existingDoor) {
            return res.status(404).json({ error: 'Дверь не найдена' });
        }
        const updatedDoor = await prisma.door.update({
            where: { id: req.params.id },
            data: req.body
        });
        await addAuditLog(req.user.id, req.user.fullName, 'door_updated', req.params.id, existingDoor.name,
            `Обновлена дверь "${existingDoor.name}"`);
        res.json(updatedDoor);
    } catch (error) {
        logger.error('[Doors] Ошибка при обновлении двери:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
};

const deleteDoorHandler = async (req, res) => {
    try {
        const existingDoor = await prisma.door.findUnique({ where: { id: req.params.id } });
        if (!existingDoor) {
            return res.status(404).json({ error: 'Дверь не найдена' });
        }
        if (existingDoor.isDeleted) {
            return res.status(400).json({ error: 'Дверь уже удалена' });
        }
        await prisma.door.update({
            where: { id: req.params.id },
            data: { isDeleted: true }
        });
        await addAuditLog(req.user.id, req.user.fullName, 'door_deleted', req.params.id, existingDoor.name,
            `Дверь "${existingDoor.name}" помечена как удалённая`);
        res.status(204).send();
    } catch (error) {
        logger.error('[Doors] Ошибка при мягком удалении двери:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
};

// ====== SEAL HANDLERS ======
const getSealsHandler = async (req, res) => {
    try {
        const seals = await prisma.seal.findMany();
        res.json(seals);
    } catch (error) {
        logger.error('[Seals] Ошибка при получении списка:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
};

const getSealByDoorHandler = async (req, res) => {
    try {
        const seal = await prisma.seal.findFirst({ where: { doorId: req.params.doorId } });
        if (!seal) {
            return res.status(404).json({ error: 'Пломба для этой двери не найдена' });
        }
        res.json(seal);
    } catch (error) {
        logger.error('[Seals] Ошибка при получении пломбы:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
};

const installSealHandler = async (req, res) => {
    const { doorId, sealId } = req.body;
    const validationErrors = validateSealOperation(req.body);
    if (validationErrors.length > 0) {
        return res.status(400).json({ error: 'Неверные данные' });
    }
    try {
        const door = await prisma.door.findUnique({ where: { id: doorId } });
        if (!door) {
            return res.status(404).json({ error: 'Дверь не найдена' });
        }
        const existingSeal = await prisma.seal.findFirst({
            where: { doorId, status: 'installed' }
        });
        if (existingSeal) {
            return res.status(409).json({ error: 'На этой двери уже установлена пломба' });
        }
        const newSeal = await prisma.seal.create({
            data: {
                id: sealId || Date.now().toString(),
                doorId: doorId,
                status: 'installed',
                changedAt: new Date(),
                changedBy: req.user.id
            }
        });
        await prisma.door.update({
            where: { id: doorId },
            data: { hasSeal: true }
        });
        await addAuditLog(req.user.id, req.user.fullName, 'install_seal', doorId, door.name,
            `Установлена пломба на дверь "${door.name}"`);
        res.status(201).json(newSeal);
    } catch (error) {
        logger.error('[Seals] Ошибка при установке пломбы:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
};

const removeSealHandler = async (req, res) => {
    const { doorId } = req.body;
    const validationErrors = validateSealOperation(req.body);
    if (validationErrors.length > 0) {
        return res.status(400).json({ error: 'Неверные данные' });
    }
    try {
        const door = await prisma.door.findUnique({ where: { id: doorId } });
        if (!door) {
            return res.status(404).json({ error: 'Дверь не найдена' });
        }
        const seal = await prisma.seal.findFirst({
            where: { doorId, status: 'installed' }
        });
        if (!seal) {
            return res.status(404).json({ error: 'На этой двери нет установленной пломбы' });
        }
        const updatedSeal = await prisma.seal.update({
            where: { id: seal.id },
            data: {
                status: 'removed',
                changedAt: new Date(),
                changedBy: req.user.id
            }
        });
        await prisma.door.update({
            where: { id: doorId },
            data: { hasSeal: false }
        });
        await addAuditLog(req.user.id, req.user.fullName, 'remove_seal', doorId, door.name,
            `Снята пломба с двери "${door.name}"`);
        res.json(updatedSeal);
    } catch (error) {
        logger.error('[Seals] Ошибка при снятии пломбы:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
};

const breakSealHandler = async (req, res) => {
    const { doorId } = req.body;
    const validationErrors = validateSealOperation(req.body);
    if (validationErrors.length > 0) {
        return res.status(400).json({ error: 'Неверные данные' });
    }
    try {
        const door = await prisma.door.findUnique({ where: { id: doorId } });
        if (!door) {
            return res.status(404).json({ error: 'Дверь не найдена' });
        }
        const seal = await prisma.seal.findFirst({
            where: { doorId, status: 'installed' }
        });
        if (!seal) {
            return res.status(404).json({ error: 'На этой двери нет установленной пломбы' });
        }
        const updatedSeal = await prisma.seal.update({
            where: { id: seal.id },
            data: {
                status: 'broken',
                changedAt: new Date(),
                changedBy: req.user.id
            }
        });
        await prisma.door.update({
            where: { id: doorId },
            data: { hasSeal: false }
        });
        await addAuditLog(req.user.id, req.user.fullName, 'break_seal', doorId, door.name,
            `Пломба на двери "${door.name}" взломана`);
        await sendAlertEmail(
            `Взлом пломбы на двери "${door.name}"!\n\nПломба была взломана пользователем ${req.user.fullName} (${req.user.username}).\nID двери: ${doorId}\nВремя: ${new Date().toLocaleString()}`,
            'high'
        );
        res.json(updatedSeal);
    } catch (error) {
        logger.error('[Seals] Ошибка при взломе пломбы:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
};

const disableSealHandler = async (req, res) => {
    const { doorId } = req.body;
    const validationErrors = validateSealOperation(req.body);
    if (validationErrors.length > 0) {
        return res.status(400).json({ error: 'Неверные данные' });
    }
    try {
        const door = await prisma.door.findUnique({ where: { id: doorId } });
        if (!door) {
            return res.status(404).json({ error: 'Дверь не найдена' });
        }
        const seal = await prisma.seal.findFirst({
            where: { doorId, status: 'installed' }
        });
        if (!seal) {
            return res.status(404).json({ error: 'На этой двери нет установленной пломбы' });
        }
        const updatedSeal = await prisma.seal.update({
            where: { id: seal.id },
            data: {
                status: 'disabled',
                changedAt: new Date(),
                changedBy: req.user.id
            }
        });
        await prisma.door.update({
            where: { id: doorId },
            data: { hasSeal: true }
        });
        await addAuditLog(req.user.id, req.user.fullName, 'disable_seal', doorId, door.name,
            `Пломба на двери "${door.name}" отключена`);
        res.json(updatedSeal);
    } catch (error) {
        logger.error('[Seals] Ошибка при отключении пломбы:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
};

const enableSealHandler = async (req, res) => {
    const { doorId } = req.body;
    const validationErrors = validateSealOperation(req.body);
    if (validationErrors.length > 0) {
        return res.status(400).json({ error: 'Неверные данные' });
    }
    try {
        const door = await prisma.door.findUnique({ where: { id: doorId } });
        if (!door) {
            return res.status(404).json({ error: 'Дверь не найдена' });
        }
        const seal = await prisma.seal.findFirst({
            where: { doorId, status: 'disabled' }
        });
        if (!seal) {
            return res.status(404).json({ error: 'На этой двери нет отключённой пломбы' });
        }
        const updatedSeal = await prisma.seal.update({
            where: { id: seal.id },
            data: {
                status: 'installed',
                changedAt: new Date(),
                changedBy: req.user.id
            }
        });
        await prisma.door.update({
            where: { id: doorId },
            data: { hasSeal: true }
        });
        await addAuditLog(req.user.id, req.user.fullName, 'enable_seal', doorId, door.name,
            `Пломба на двери "${door.name}" включена`);
        res.json(updatedSeal);
    } catch (error) {
        logger.error('[Seals] Ошибка при включении пломбы:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
};

// ====== AUDIT HANDLERS ======
const getAuditLogHandler = async (req, res) => {
    try {
        const logs = await prisma.auditLog.findMany({
            orderBy: { timestamp: 'desc' }
        });
        res.json(logs);
    } catch (error) {
        logger.error('[Audit] Ошибка при получении журнала:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
};

const verifyAuditChainHandler = async (req, res) => {
    try {
        const logs = await prisma.auditLog.findMany({
            orderBy: { timestamp: 'asc' }
        });
        const result = verifyHashChain(logs);
        if (!result.valid) {
            await sendAlertEmail(
                `Обнаружено нарушение целостности журнала аудита! Детали: ${result.error}`,
                'high'
            );
        }
        res.json(result);
    } catch (error) {
        logger.error('[Audit] Ошибка при проверке цепочки:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
};

// ====== USER HANDLERS ======
const getUsersHandler = async (req, res) => {
    try {
        const users = await prisma.user.findMany({
            where: { isDeleted: false }
        });
        const safeUsers = users.map(({ password, ...user }) => user);
        res.json(safeUsers);
    } catch (error) {
        logger.error('[Users] Ошибка при получении списка:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
};

const getUserByIdHandler = async (req, res) => {
    try {
        const user = await prisma.user.findUnique({ where: { id: req.params.id } });
        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        const { password, ...safeUser } = user;
        res.json(safeUser);
    } catch (error) {
        logger.error('[Users] Ошибка при получении пользователя:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
};

const createUserHandler = async (req, res) => {
    const { username, password, role, fullName } = req.body;
    const validationErrors = validateUserData(req.body);
    if (validationErrors.length > 0) {
        return res.status(400).json({ error: 'Неверные данные' });
    }
    try {
        const existingUser = await prisma.user.findUnique({ where: { username } });
        if (existingUser) {
            return res.status(409).json({ error: 'Пользователь с таким логином уже существует' });
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
        await addAuditLog(req.user.id, req.user.fullName, 'user_created', null, null,
            `Создан пользователь "${username}"`);
        sendAlertEmail(
            `Новый пользователь "${username}" ожидает утверждения`,
            'medium'
        );
        const { password: _, ...safeUser } = newUser;
        res.status(201).json(safeUser);
    } catch (error) {
        logger.error('[Users] Ошибка при создании пользователя:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
};

const approveUserHandler = async (req, res) => {
    try {
        const user = await prisma.user.findUnique({ where: { id: req.params.id } });
        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        if (user.approved) {
            return res.status(409).json({ error: 'Пользователь уже утверждён' });
        }
        const updatedUser = await prisma.user.update({
            where: { id: req.params.id },
            data: { approved: true }
        });
        await addAuditLog(req.user.id, req.user.fullName, 'user_approved', null, null,
            `Утверждён пользователь "${user.username}"`);
        const { password: _, ...safeUser } = updatedUser;
        res.json({ success: true, user: safeUser });
    } catch (error) {
        logger.error('[Users] Ошибка при утверждении пользователя:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
};

const enable2FAHandler = async (req, res) => {
    try {
        const user = await prisma.user.findUnique({ where: { id: req.params.id } });
        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        await prisma.user.update({
            where: { id: req.params.id },
            data: { twoFactorEnabled: true }
        });
        await addAuditLog(req.user.id, req.user.fullName, '2fa_enabled', null, null,
            `2FA включена для пользователя "${user.username}"`);
        res.json({ success: true, message: '2FA успешно включена' });
    } catch (error) {
        logger.error('[2FA] Ошибка при включении 2FA:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
};

const disable2FAHandler = async (req, res) => {
    try {
        const user = await prisma.user.findUnique({ where: { id: req.params.id } });
        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        await prisma.user.update({
            where: { id: req.params.id },
            data: { twoFactorEnabled: false }
        });
        await addAuditLog(req.user.id, req.user.fullName, '2fa_disabled', null, null,
            `2FA отключена для пользователя "${user.username}"`);
        res.json({ success: true, message: '2FA успешно отключена' });
    } catch (error) {
        logger.error('[2FA] Ошибка при отключении 2FA:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
};

const get2FAStatusHandler = async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.params.id },
            select: { id: true, username: true, twoFactorEnabled: true }
        });
        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        res.json(user);
    } catch (error) {
        logger.error('[2FA] Ошибка при получении статуса 2FA:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
};

const deleteUserHandler = async (req, res) => {
    if (req.params.id === req.user.id) {
        return res.status(400).json({ error: 'Нельзя удалить самого себя' });
    }
    try {
        const user = await prisma.user.findUnique({ where: { id: req.params.id } });
        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        if (user.isDeleted) {
            return res.status(400).json({ error: 'Пользователь уже удалён' });
        }
        await prisma.user.update({
            where: { id: req.params.id },
            data: { isDeleted: true }
        });
        await addAuditLog(req.user.id, req.user.fullName, 'user_deleted', null, null,
            `Пользователь "${user.username}" помечен как удалённый`);
        res.status(204).send();
    } catch (error) {
        logger.error('[Users] Ошибка при мягком удалении пользователя:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
};

const updateUserHandler = async (req, res) => {
    try {
        const user = await prisma.user.findUnique({ where: { id: req.params.id } });
        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
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
        await addAuditLog(req.user.id, req.user.fullName, 'user_updated', null, null,
            `Обновлён пользователь "${user.username}"`);
        const { password: _, ...safeUser } = updatedUser;
        res.json(safeUser);
    } catch (error) {
        logger.error('[Users] Ошибка при обновлении пользователя:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
};

// ====== ALERT HANDLER ======
const alertHandler = (req, res) => {
    const { message, severity } = req.body;
    if (!message) {
        return res.status(400).json({ error: 'Неверные данные' });
    }
    sendAlertEmail(message, severity || 'medium')
        .then(() => {
            logger.info(`[Alert] Уведомление отправлено: ${message}`);
            res.json({ success: true });
        })
        .catch(err => {
            logger.error('[Alert] Ошибка отправки уведомления:', err);
            res.status(500).json({ error: 'Ошибка сервера' });
        });
};

// ====== ROUTES ======
app.post('/api/login', verifyCaptcha, loginHandler);
app.post('/api/2fa/verify-code', twoFAVerifyHandler);
app.post('/api/register', verifyCaptcha, registerHandler);
app.post('/api/refresh', refreshHandler);
app.post('/api/logout', authenticateToken, logoutHandler);
app.post('/api/forgot-password', forgotPasswordHandler);
app.post('/api/reset-password', resetPasswordHandler);

app.get('/api/doors', authenticateToken, requireApproved(), checkPermission('doors', 'read'), csrfProtection, getDoorsHandler);
app.get('/api/doors/:id', authenticateToken, requireApproved(), checkPermission('doors', 'read'), csrfProtection, getDoorByIdHandler);
app.post('/api/doors', authenticateToken, requireApproved(), checkPermission('doors', 'create'), csrfProtection, createDoorHandler);
app.put('/api/doors/:id', authenticateToken, requireApproved(), checkPermission('doors', 'update'), csrfProtection, updateDoorHandler);
app.delete('/api/doors/:id', authenticateToken, requireApproved(), checkPermission('doors', 'delete'), csrfProtection, deleteDoorHandler);

app.get('/api/seals', authenticateToken, requireApproved(), checkPermission('seals', 'read'), csrfProtection, getSealsHandler);
app.get('/api/seals/:doorId', authenticateToken, requireApproved(), checkPermission('seals', 'read'), csrfProtection, getSealByDoorHandler);
app.post('/api/seals/install', authenticateToken, requireApproved(), checkPermission('seals', 'install'), csrfProtection, installSealHandler);
app.post('/api/seals/remove', authenticateToken, requireApproved(), checkPermission('seals', 'remove'), csrfProtection, removeSealHandler);
app.post('/api/seals/break', authenticateToken, requireApproved(), checkPermission('seals', 'break'), csrfProtection, breakSealHandler);
app.post('/api/seals/disable', authenticateToken, requireApproved(), checkPermission('seals', 'disable'), csrfProtection, disableSealHandler);
app.post('/api/seals/enable', authenticateToken, requireApproved(), checkPermission('seals', 'enable'), csrfProtection, enableSealHandler);

app.get('/api/audit-log', authenticateToken, requireApproved(), checkPermission('audit', 'read'), csrfProtection, getAuditLogHandler);
app.get('/api/audit-log/verify', authenticateToken, requireApproved(), checkPermission('audit', 'verify'), csrfProtection, verifyAuditChainHandler);

app.get('/api/users', authenticateToken, requireApproved(), checkPermission('users', 'read'), csrfProtection, getUsersHandler);
app.get('/api/users/:id', authenticateToken, requireApproved(), checkPermission('users', 'read'), csrfProtection, getUserByIdHandler);
app.post('/api/users', authenticateToken, requireApproved(), checkPermission('users', 'create'), csrfProtection, createUserHandler);
app.post('/api/users/:id/approve', authenticateToken, requireApproved(), checkPermission('users', 'approve'), csrfProtection, approveUserHandler);
app.post('/api/users/:id/2fa/enable', authenticateToken, requireApproved(), checkPermission('users', 'update'), csrfProtection, enable2FAHandler);
app.post('/api/users/:id/2fa/disable', authenticateToken, requireApproved(), checkPermission('users', 'update'), csrfProtection, disable2FAHandler);
app.get('/api/users/:id/2fa/status', authenticateToken, requireApproved(), checkPermission('users', 'read'), csrfProtection, get2FAStatusHandler);
app.delete('/api/users/:id', authenticateToken, requireApproved(), checkPermission('users', 'delete'), csrfProtection, deleteUserHandler);
app.put('/api/users/:id', authenticateToken, requireApproved(), checkPermission('users', 'update'), csrfProtection, updateUserHandler);

app.post('/api/alert', authenticateToken, requireApproved(), csrfProtection, alertHandler);

ensureBootstrapAdmin();

app.listen(PORT, () => {
    logger.info(`[Server] Сервер запущен на http://localhost:${PORT}`);
    logger.info(`Документация Swagger доступна по адресу: http://localhost:${PORT}/api-docs`);
});
