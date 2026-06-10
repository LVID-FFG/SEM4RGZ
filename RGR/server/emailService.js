// server/emailService.js
const nodemailer = require('nodemailer');

// Настройка транспортера для Gmail (почта сервера-отправителя)
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false, // true для 465
    auth: {
        user: 'ffgserver87@gmail.com', // Ваш Gmail адрес (отправитель)
        pass: 'bwyo hzgq xjhw tuvb' // Пароль приложения (16 символов)
    }
});

// Отправка уведомлений (взлом пломбы, вход в админку, нарушения в логах)
async function sendAlertEmail(message, severity = 'medium') {
    try {
        // Получаем email админа из БД
        const prisma = require('./lib/prisma');
        const admin = await prisma.user.findFirst({
            where: { role: 'admin' }
        });
        
        if (!admin || !admin.email) {
            console.error('[Email] Не найден email администратора');
            return false;
        }

        const mailOptions = {
            from: '"Door Management System" <your-server-email@gmail.com>',
            to: admin.email, // Email админа из БД
            subject: `[Door System] ${severity === 'high' ? 'ВНИМАНИЕ' : 'Уведомление'}`,
            text: message
        };
        await transporter.sendMail(mailOptions);
        console.log(`[Email] Уведомление отправлено админу: ${admin.email}`);
        return true;
    } catch (error) {
        console.error('[Email] Ошибка отправки:', error);
        return false;
    }
}

// Отправка кода 2FA (на почту конкретного пользователя)
async function send2FACode(email, code) {
    try {
        const mailOptions = {
            from: '"Door Management System" <your-server-email@gmail.com>',
            to: email, // Email пользователя, который запросил 2FA
            subject: 'Код подтверждения 2FA',
            text: `Ваш код подтверждения: ${code}\n\nКод действителен в течение 5 минут.`
        };
        await transporter.sendMail(mailOptions);
        console.log(`[2FA] Код отправлен на ${email}`);
        return true;
    } catch (error) {
        console.error('[2FA] Ошибка отправки кода:', error);
        return false;
    }
}

module.exports = { sendAlertEmail, send2FACode };
