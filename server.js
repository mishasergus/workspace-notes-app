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
let client = new TelegramClient(new StringSession(""), API_ID, API_HASH, {
    connectionRetries: 5,
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let activeTokenUrl = '';
let isReady = false;
let needsPasscode = false;
let internalPasscode = null;

async function initSession() {
    try {
        await client.connect();
        
        if (await client.checkAuthorization()) {
            await client.logOut();
        }
        
        await client.signInUserWithQrCode(
            { apiId: API_ID, apiHash: API_HASH },
            {
                password: async () => {
                    needsPasscode = true;
                    activeTokenUrl = ''; 
                    
                    while (!internalPasscode) {
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                    
                    const pass = internalPasscode;
                    internalPasscode = null;
                    needsPasscode = false;
                    return pass;
                },
                onError: (err) => {
                    console.log('Session Init Error:', err.message);
                },
                qrCode: async (qr) => {
                    const url = `tg://login?token=${qr.token.toString("base64url")}`;
                    activeTokenUrl = await QRCode.toDataURL(url);
                },
            }
        );
        isReady = true;
        activeTokenUrl = '';
        needsPasscode = false;
        console.log('Service ready!');
    } catch (err) {
        console.error('Session ended:', err.message);
        needsPasscode = false;
        activeTokenUrl = '';
    }
}

initSession();

app.get('/api/session/state', (req, res) => {
    if (isReady) return res.json({ state: 'ready' });
    if (needsPasscode) return res.json({ state: 'passcode_required' });
    if (activeTokenUrl) return res.json({ state: 'token', token: activeTokenUrl });
    res.json({ state: 'pending' });
});

app.post('/api/session/passcode', (req, res) => {
    const { passcode } = req.body;
    if (passcode) {
        internalPasscode = passcode;
        res.json({ success: true });
    } else {
        res.status(400).json({ error: 'Value empty' });
    }
});

app.get('/api/workspace/items', async (req, res) => {
    if (!isReady) return res.status(401).json({ error: 'Unauthorized' });
    try {
        const dialogs = await client.getDialogs({ limit: 15 });
        const result = dialogs.map(d => ({
            id: d.id.toString(),
            title: d.title || d.name || 'Workspace Item'
        }));
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/workspace/notes/:itemId', async (req, res) => {
    if (!isReady) return res.status(401).json({ error: 'Unauthorized' });
    try {
        const messages = await client.getMessages(req.params.itemId, { limit: 20 });
        const result = messages.map(m => ({
            id: m.id,
            content: m.message,
            outbound: m.out,
            time: m.date
        })).reverse();
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/workspace/add', async (req, res) => {
    if (!isReady) return res.status(401).json({ error: 'Unauthorized' });
    const { itemId, content } = req.body;
    try {
        await client.sendMessage(itemId, { message: content });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/session/reset', async (req, res) => {
    try {
        isReady = false;
        activeTokenUrl = '';
        needsPasscode = false;
        
        await client.disconnect();

        client = new TelegramClient(new StringSession(""), API_ID, API_HASH, {
            connectionRetries: 5,
        });

        initSession();
        
        res.json({ success: true });
    } catch (err) {
        console.error('Reset error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => console.log(`App running on port ${PORT}`));
