const express = require('express');
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const QRCode = require('qrcode');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;

const API_ID = parseInt(process.env.API_ID || '0');
const API_HASH = process.env.API_HASH || '';

const stringSession = new StringSession("");
const client = new TelegramClient(stringSession, API_ID, API_HASH, {
    connectionRetries: 5,
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let qrCodeUrl = '';
let isAuthenticated = false;
let needs2FA = false;
let userPassword = null;

async function startQrAuth() {
    try {
        await client.connect();
        await client.signInUserWithQrCode(
            { apiId: API_ID, apiHash: API_HASH },
            {
                password: async () => {
                    needs2FA = true;
                    qrCodeUrl = ''; // Ховаємо QR, бо його вже відсканували
                    
                    // Чекаємо, поки користувач введе пароль на сайті
                    while (!userPassword) {
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                    
                    const pass = userPassword;
                    userPassword = null;
                    needs2FA = false;
                    return pass;
                },
                onError: (err) => {
                    console.log('QR Auth Error:', err.message);
                },
                qrCode: async (qr) => {
                    const url = `tg://login?token=${qr.token.toString("base64url")}`;
                    qrCodeUrl = await QRCode.toDataURL(url);
                },
            }
        );
        isAuthenticated = true;
        qrCodeUrl = '';
        needs2FA = false;
        console.log('Successfully authenticated!');
    } catch (err) {
        console.error('Auth process ended:', err.message);
        needs2FA = false;
        qrCodeUrl = '';
    }
}

startQrAuth();

app.get('/api/auth/status', (req, res) => {
    if (isAuthenticated) return res.json({ status: 'authorized' });
    if (needs2FA) return res.json({ status: '2fa_required' });
    if (qrCodeUrl) return res.json({ status: 'qr', qr: qrCodeUrl });
    res.json({ status: 'loading' });
});

app.post('/api/auth/password', (req, res) => {
    const { password } = req.body;
    if (password) {
        userPassword = password;
        res.json({ success: true });
    } else {
        res.status(400).json({ error: 'Password cannot be empty' });
    }
});

app.get('/api/dialogs', async (req, res) => {
    if (!isAuthenticated) return res.status(401).json({ error: 'Unauthorized' });
    try {
        const dialogs = await client.getDialogs({ limit: 15 });
        const result = dialogs.map(d => ({
            id: d.id.toString(),
            name: d.title || d.name || 'Chat'
        }));
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/messages/:chatId', async (req, res) => {
    if (!isAuthenticated) return res.status(401).json({ error: 'Unauthorized' });
    try {
        const messages = await client.getMessages(req.params.chatId, { limit: 20 });
        const result = messages.map(m => ({
            id: m.id,
            text: m.message,
            out: m.out,
            date: m.date
        })).reverse();
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/send', async (req, res) => {
    if (!isAuthenticated) return res.status(401).json({ error: 'Unauthorized' });
    const { chatId, text } = req.body;
    try {
        await client.sendMessage(chatId, { message: text });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
