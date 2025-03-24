
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const admin = require('firebase-admin');
const serviceAccount = require('./firebase-service-account.json');

// Firebase 初期化
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

const app = express();
app.use(express.json());

const LINE_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// 🔁 Firestore から有料ユーザーかどうか確認する関数
async function isPaidUser(userId) {
    try {
        const doc = await db.collection('paidUsers').doc(userId).get(); // ✅ 修正済み
        return doc.exists && doc.data().isPaid === true;
    } catch (error) {
        console.error("Firestore読み込みエラー:", error);
        return false;
    }
}

// 🔮 ChatGPT APIを使って占いのメッセージを取得
async function getChatGPTResponse(userMessage) {
    try {
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: "gpt-4",
            messages: [
                {
                    role: "system",
                    content: "あなたは彼女です。ため口で話してください。"               
                },
                { role: "user", content: userMessage }
            ]
        }, {
            headers: {
                "Authorization": `Bearer ${OPENAI_API_KEY}`,
                "Content-Type": "application/json"
            }
        });

        return response.data.choices[0].message.content;
    } catch (error) {
        console.error("ChatGPT APIエラー:", error.response?.data || error.message);
        return "占いの結果を取得できませんでした…もう一度試してください。";
    }
}

// 💬 LINE APIでユーザーに返信
async function replyMessage(userId, text) {
    try {
        await axios.post('https://api.line.me/v2/bot/message/push', {
            to: userId,
            messages: [{ type: "text", text }]
        }, {
            headers: {
                "Authorization": `Bearer ${LINE_ACCESS_TOKEN}`,
                "Content-Type": "application/json"
            }
        });
    } catch (error) {
        console.error("LINE返信エラー:", error.response?.data || error.message);
    }
}

// 🌐 LINEのWebhookを受け取るエンドポイント
app.post('/webhook', async (req, res) => {
    const events = req.body.events;

    for (let event of events) {
        if (event.type === 'message' && event.message.type === 'text') {
            const userId = event.source.userId;
            const userMessage = event.message.text;

            console.log(`ユーザー(${userId})のメッセージ: ${userMessage}`);

            // 🔐 有料ユーザーかチェック
            const paid = await isPaidUser(userId);
            if (!paid) {
                await replyMessage(userId,
                    "このサービスは月額制です🌙 ご利用には登録が必要です。\n" +
                    "↓こちらから登録をお願いします。\n" +
                    "https://manabu-yts.stores.jp"
                );
                continue;
            }

            // 🔮 ChatGPTで占いメッセージを作成
            const replyText = await getChatGPTResponse(userMessage);

            // 💌 LINEに返信
            await replyMessage(userId, replyText);
        }
    }

    res.sendStatus(200);
});

// 🩺 ヘルスチェックエンドポイント
app.get("/", (req, res) => {
    res.send("LINE Fortune Bot is running!");
});

// 🚀 サーバー起動（Render対応）
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
