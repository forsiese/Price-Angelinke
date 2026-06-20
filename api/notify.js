import nodemailer from 'nodemailer';

// Создаём транспорт Gmail ОДИН РАЗ при холодном старте функции
let gmailTransport = null;

function getGmailTransport() {
    if (gmailTransport) return gmailTransport;

    const EMAIL_USER = process.env.EMAIL_USER;
    const EMAIL_PASS = process.env.EMAIL_PASS;

    if (!EMAIL_USER || !EMAIL_PASS) {
        console.error('EMAIL_USER or EMAIL_PASS not configured');
        return null;
    }

    gmailTransport = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: {
            user: EMAIL_USER,
            pass: EMAIL_PASS
        }
    });

    return gmailTransport;
}

// Отправка в Telegram
async function sendTelegram(message, chatId) {
    const BOT_TOKEN = process.env.BOT_TOKEN;
    const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

    if (!BOT_TOKEN) {
        console.error('BOT_TOKEN not configured');
        return { ok: false, error: 'BOT_TOKEN not configured' };
    }

    const targetChatId = chatId || ADMIN_CHAT_ID;
    if (!targetChatId) {
        console.error('No chat ID available');
        return { ok: false, error: 'No chat ID' };
    }

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
            return { ok: false, error: data.description };
        }

        return { ok: true, message_id: data.result?.message_id };
    } catch (error) {
        console.error('Telegram send error:', error);
        return { ok: false, error: error.message };
    }
}

// Отправка Email через Gmail
async function sendEmail(toEmail, clientName, subject, htmlBody) {
    const transport = getGmailTransport();
    if (!transport) {
        return { ok: false, error: 'Gmail not configured' };
    }

    if (!toEmail) {
        return { ok: false, error: 'No recipient email' };
    }

    try {
        const info = await transport.sendMail({
            from: `"lashestakova" <${process.env.EMAIL_USER}>`,
            to: toEmail,
            subject: subject,
            html: htmlBody
        });

        console.log('Email sent to:', toEmail, 'MessageId:', info.messageId);
        return { ok: true, messageId: info.messageId };
    } catch (error) {
        console.error('Email send error:', error);
        return { ok: false, error: error.message };
    }
}

// Генерация HTML-шаблона письма
function buildEmailHtml(type, data) {
    if (type === 'approved') {
        return `
            <div style="font-family: 'Montserrat', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #F2F2F0; border-radius: 16px;">
                <h1 style="font-size: 22px; color: #16a34a; margin-bottom: 8px;">Запись подтверждена!</h1>
                <p style="color: #666; font-size: 14px; margin-bottom: 24px;">Здравствуйте, ${data.clientName}!</p>

                <div style="background: #fff; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
                    <p style="font-size: 14px; color: #161616; margin-bottom: 8px;"><strong>Услуги:</strong> ${data.services}</p>
                    <p style="font-size: 14px; color: #161616; margin-bottom: 8px;"><strong>Дата:</strong> ${data.date} в ${data.time}</p>
                    <p style="font-size: 14px; color: #161616;"><strong>Сумма:</strong> ${data.price}</p>
                </div>

                <div style="background: rgba(22, 163, 74, 0.08); border-radius: 12px; padding: 16px; margin-bottom: 20px;">
                    <p style="font-size: 13px; color: #161616; margin: 0;">
                        <strong>Адрес:</strong> г. Альметьевск, ул. Ленина, д. 141б, кв. 75
                    </p>
                </div>

                <p style="font-size: 13px; color: #999; text-align: center;">Ждём вас!</p>
                <p style="font-size: 11px; color: #ccc; text-align: center; margin-top: 24px;">lashestakova</p>
            </div>
        `;
    }

    if (type === 'rejected') {
        return `
            <div style="font-family: 'Montserrat', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #F2F2F0; border-radius: 16px;">
                <h1 style="font-size: 22px; color: #dc2626; margin-bottom: 8px;">Запись отклонена</h1>
                <p style="color: #666; font-size: 14px; margin-bottom: 24px;">Здравствуйте, ${data.clientName}!</p>

                <div style="background: #fff; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
                    <p style="font-size: 14px; color: #161616; margin-bottom: 8px;"><strong>Услуги:</strong> ${data.services}</p>
                    <p style="font-size: 14px; color: #161616;"><strong>Дата:</strong> ${data.date} в ${data.time}</p>
                </div>

                <div style="background: rgba(220, 38, 38, 0.08); border-radius: 12px; padding: 16px; margin-bottom: 20px;">
                    <p style="font-size: 13px; color: #161616; margin: 0;">
                        К сожалению, выбранное время недоступно. Пожалуйста, выберите другое время на сайте.
                    </p>
                </div>

                <p style="font-size: 11px; color: #ccc; text-align: center; margin-top: 24px;">lashestakova</p>
            </div>
        `;
    }

    return '<p>Уведомление от lashestakova</p>';
}

// ==================== ГЛАВНЫЙ HANDLER ====================
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }

    const { type, message, clientEmail, clientName, subject } = req.body;

    // Валидация минимальных данных
    if (!type) {
        return res.status(400).json({ ok: false, error: 'Missing "type" field' });
    }

    const results = {
        telegram: null,
        email: null
    };

    // --- ОТПРАВКА В TELEGRAM ---
    try {
        let targetChatId = null;

        // Если уведомление клиенту и указан его telegram username,
        // пробуем отправить ему (работает только если он написал боту /start)
        // Иначе отправляем админу
        if (type === 'client') {
            targetChatId = process.env.ADMIN_CHAT_ID; // логируем в админский чат тоже
        }

        results.telegram = await sendTelegram(message, targetChatId);
    } catch (error) {
        results.telegram = { ok: false, error: error.message };
    }

    // --- ОТПРАВКА EMAIL (ТОЛЬКО ДЛЯ КЛИЕНТА) ---
    if (type === 'client' && clientEmail) {
        try {
            // Определяем тип письма по subject
            let emailType = 'approved';
            if (subject && subject.includes('отклонена')) {
                emailType = 'rejected';
            }

            // Извлекаем данные из message для шаблона
            const htmlBody = buildEmailHtml(emailType, {
                clientName: clientName || 'Клиент',
                services: extractField(message, 'Услуги'),
                date: extractField(message, 'Дата') || '',
                time: extractTime(message),
                price: extractField(message, 'Сумма')
            });

            results.email = await sendEmail(
                clientEmail,
                clientName,
                subject || 'Уведомление от lashestakova',
                htmlBody
            );
        } catch (error) {
            results.email = { ok: false, error: error.message };
        }
    }

    // --- ФОРМИРУЕМ ОТВЕТ ---
    const allOk = results.telegram?.ok && (results.email?.ok || !results.email);
    const anyOk = results.telegram?.ok || results.email?.ok;

    return res.status(allOk ? 200 : (anyOk ? 207 : 500)).json({
        ok: allOk,
        partial: anyOk && !allOk,
        telegram: results.telegram,
        email: results.email
    });
}

// Вспомогательная функция: извлечь значение после bold-тега
function extractField(message, fieldName) {
    const regex = new RegExp('<b>' + fieldName + ':?<\\/b>\\s*(.+?)(?:<br>|$)', 'i');
    const match = message.match(regex);
    return match ? match[1].trim() : '';
}

// Вспомогательная функция: извлечь время из строки "DD.MM.YYYY в HH:MM"
function extractTime(message) {
    const match = message.match(/(\d{2}:\d{2})/);
    return match ? match[1] : '';
}
