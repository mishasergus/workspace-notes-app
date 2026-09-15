const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Токен вашого бота від BotFather
const BOT_TOKEN = process.env.BOT_TOKEN || 'ВАШ_TELEGRAM_BOT_TOKEN';
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Отримання останніх повідомлень, які прийшли боту
app.get('/api/messages', async (req, res) => {
    try {
        const response = await axios.get(`${TELEGRAM_API}/getUpdates`);
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Відправка повідомлення через бота
app.post('/api/send', async (req, res) => {
    const { chatId, text } = req.body;
    try {
        const response = await axios.post(`${TELEGRAM_API}/sendMessage`, {
            chat_id: chatId,
            text: text
        });
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
