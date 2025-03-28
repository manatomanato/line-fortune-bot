require('dotenv').config();
const express = require('express');
const axios = require('axios');
const admin = require('firebase-admin');

const serviceAccount = JSON.parse(
  Buffer.from(process.env.FIREBASE_CONFIG_BASE64, 'base64').toString('utf-8')
);

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

const app = express();
app.use(express.json());

const LINE_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// 📸 画像リスト
const goodnightImages = [
    "https://i.imgur.com/vi1ga0b.png",
    "https://imgur.com/a/IY7LyQZ",
　　"https://i.imgur.com/LYMxbQW.png",

];

const cheerupImages = [
    "https://i.imgur.com/6lf1wlJ.png",
    "https://i.imgur.com/rDxf2ux.png",
];

// 🎲 ランダム画像を選ぶ
function getRandomImage(imageList) {
    const index = Math.floor(Math.random() * imageList.length);
    return imageList[index];
}

// 🔁 Firestore から有料ユーザーかどうか確認
async function isPaidUser(userId) {
    try {
        const doc = await db.collection('paidUsers').doc(userId).get();
        return doc.exists && doc.data().isPaid === true;
    } catch (error) {
        console.error("Firestore読み込みエラー:", error);
        return false;
    }
}

// 🐧 ペンたんの返答を作る（ChatGPT）
async function getChatGPTResponse(userMessage) {
    try {
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: "gpt-4",
            messages: [
                {
                    role: "system",
                    content: "あなたは『ペンたん』という名前のかわいいペンギンです。相談者の悩みや不安に寄り添い、まるで親友のように優しく癒しを与えてください。ため口で励ましてください。"
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
        return "今ちょっとお返事できなかったよ…もう一回話しかけてくれる？🐧";
    }
}

// 📩 LINEにテキストを送る
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

// 🖼 LINEにテキスト+画像を送る
async function replyImageWithText(userId, text, imageUrl) {
    try {
        await axios.post('https://api.line.me/v2/bot/message/push', {
            to: userId,
            messages: [
                { type: "text", text },
                {
                    type: "image",
                    originalContentUrl: imageUrl,
                    previewImageUrl: imageUrl
                }
            ]
        }, {
            headers: {
                "Authorization": `Bearer ${LINE_ACCESS_TOKEN}`,
                "Content-Type": "application/json"
            }
        });
    } catch (error) {
        console.error("LINE画像返信エラー:", error.response?.data || error.message);
    }
}

// 🌐 Webhook
app.post('/webhook', async (req, res) => {
    const events = req.body.events;

    for (let event of events) {
        if (event.type === 'message' && event.message.type === 'text') {
            const userId = event.source.userId;
            const userMessage = event.message.text.toLowerCase();

            console.log(`ユーザー(${userId})のメッセージ: ${userMessage}`);

            const paid = await isPaidUser(userId);
            if (!paid) {
                await replyMessage(userId,
                    "このサービスは月額制です🌙 ご利用には登録が必要です。\n" +
                    "↓こちらから登録をお願いします。\n" +
                    "https://manabuyts.stores.jp"
                );
                continue;
            }

            // 🌙 「ねるね」→おやすみ画像
            if (userMessage.includes("ねるね")) {
                const image = getRandomImage(goodnightImages);
                await replyImageWithText(userId, "ぺんたんもそろそろ寝るね…おやすみぃ🐧🌙", image);
                continue;
            }

            // 😢 落ち込み系ワード→励まし画像
            if (
                userMessage.includes("つらい") ||
                userMessage.includes("しんどい") ||
                userMessage.includes("疲れた") ||
                userMessage.includes("もうだめ") ||
                userMessage.includes("やる気ない")
            ) {
                const image = getRandomImage(cheerupImages);
                await replyImageWithText(userId, "大丈夫だよ、ぺんたんがぎゅーってしてあげる🐧💕", image);
                continue;
            }

            // 通常のChatGPT返信
            const replyText = await getChatGPTResponse(userMessage);
            await replyMessage(userId, replyText);
        }
    }

    res.sendStatus(200);
});

// 🩺 ヘルスチェック
app.get("/", (req, res) => {
    res.send("LINE ペンたんBotは起動中だよ🐧");
});

// 🚀 Render用ポート
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
