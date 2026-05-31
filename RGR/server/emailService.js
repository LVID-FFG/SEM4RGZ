const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: 'smtp.mailtrap.io',
    port: 2525,
    auth: {
        user: 'your_mailtrap_user',
        pass: 'your_mailtrap_pass'
    }
});

async function sendAlertEmail(message, severity = 'medium') {
    console.log(`[Email] Отправлено уведомление (${severity}): ${message}`);
    return Promise.resolve();
}

async function send2FACode(email, code) {
    try {
        console.log(`[2FA] Код для ${email}: ${code}`);
        return true;
    } catch (error) {
        console.error('[2FA] Ошибка отправки кода:', error);
        return false;
    }
}

module.exports = { sendAlertEmail, send2FACode };