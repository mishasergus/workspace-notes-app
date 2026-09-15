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

// Запуск генерації QR-коду у фоні
async function startQrAuth() {
    try {
        await client.connect();
        
        await client.signInUserWithQrCode(
            { apiId: API_ID, apiHash: API_HASH },
            {
                onError: (err) => console.log('QR Auth Error:', err.message),
                qrCode: async (qr) => {
                    const url = `tg://login?token=${qr.token.toString("base64url")}`;
                    qrCodeUrl = await QRCode.toDataURL(url);
                    console.log('New QR code generated');
                },
            }
        );
        
        isAuthenticated = true;
        qrCodeUrl = '';
        console.log('Successfully logged in!');
    } catch (err) {
        console.error('Auth process ended:', err.message);
    }
}

// Запускаємо процес авторизації одразу при старті сервера
startQrAuth();

// Ендпоінт перевірки стану
app.get('/api/auth/status', (req, res) => {
    if (isAuthenticated) {
        return res.json({ status: 'authorized' });
    }
    if (qrCodeUrl) {
        return res.json({ status: 'qr', qr: qrCodeUrl });
    }
    res.json({ status: 'loading' });
});

// Отримання чатів
app.get('/api/dialogs', async (req, res) => {
    if (!isAuthenticated) return res.status(401).json({ error: 'Unauthorized' });
    try {
        const dialogs = await client.getDialogs({ limit: 10 });
        const result = dialogs.map(d => ({
            id: d.id.toString(),
            name: d.title || d.name || 'Chat'
        }));
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
