const express = require('express');
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const QRCode = require('qrcode');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Отримати на my.telegram.org
const API_ID = parseInt(process.env.API_ID || '123456');
const API_HASH = process.env.API_HASH || 'YOUR_API_HASH';

const stringSession = new StringSession("");
const client = new TelegramClient(stringSession, API_ID, API_HASH, {
    connectionRetries: 5,
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let currentQrCode = '';
let isAuthorized = false;

// Отримання QR-коду або стану авторизації
app.get('/api/auth/qr', async (req, res) => {
    if (isAuthorized) {
        return res.json({ status: 'authorized' });
    }

    if (!client.connected) {
        await client.connect();
    }

    try {
        await client.signInUserWithQrCode(
            { apiId: API_ID, apiHash: API_HASH },
            {
                onError: (err) => console.error(err),
                qrCode: async (qr) => {
                    const url = `tg://login?token=${qr.token.toString("base64url")}`;
                    currentQrCode = await QRCode.toDataURL(url);
                },
            }
        );
        isAuthorized = true;
        currentQrCode = '';
        res.json({ status: 'authorized' });
    } catch (e) {
        if (currentQrCode) {
            res.json({ status: 'qr', qr: currentQrCode });
        } else {
            res.json({ status: 'waiting' });
        }
    }
});

// Отримання списку останніх діалогів
app.get('/api/dialogs', async (req, res) => {
    if (!isAuthorized) return res.status(401).json({ error: 'Unauthorized' });
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

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
