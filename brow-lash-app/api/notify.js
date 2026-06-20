// Vercel Serverless Function — отправка уведомлений в Telegram через бота
export default async function handler(req, res) {
    // Только POST
    if (req.method !== 'POST') {
        return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }

    const { message, chatId } = req.body;

    // Получаем переменные окружения из Vercel
    const BOT_TOKEN = process.env.BOT_TOKEN;
    const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

    if (!BOT_TOKEN) {
        console.error('BOT_TOKEN not set in Vercel env');
        return res.status(500).json({ ok: false, error: 'BOT_TOKEN not configured' });
    }

    if (!ADMIN_CHAT_ID && !chatId) {
        console.error('ADMIN_CHAT_ID not set and no chatId provided');
        return res.status(500).json({ ok: false, error: 'ADMIN_CHAT_ID not configured' });
    }

    const targetChatId = chatId || ADMIN_CHAT_ID;

    try {
        const response = await fetch(
            `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: targetChatId,
                    text: message || '(пустое сообщение)',
                    parse_mode: 'HTML',
                    disable_web_page_preview: true
                })
            }
        );

        const data = await response.json();

        if (!data.ok) {
            console.error('Telegram API error:', data.description);
            return res.status(502).json({ ok: false, error: data.description });
        }

        return res.status(200).json({ ok: true, message_id: data.result?.message_id });

    } catch (error) {
        console.error('Serverless function error:', error);
        return res.status(500).json({ ok: false, error: error.message });
    }
}