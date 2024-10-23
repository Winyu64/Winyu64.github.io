import dotenv from 'dotenv';
import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';  
import admin from 'firebase-admin';  // เพิ่มการนำเข้า Firebase Admin SDK

// กำหนดการอ่านตัวแปรสิ่งแวดล้อม
dotenv.config();
const app = express();
const port = 3000;
app.use(cors());
app.use(express.json());

// การตั้งค่า Firebase Admin SDK
const firebaseConfig = {
    apiKey: "AIzaSyACCRFfueVTM1soWsMFotDOSTwj-eWR9k4",
    authDomain: "is-guide.firebaseapp.com",
    projectId: "is-guide",
    storageBucket: "is-guide.appspot.com",
    messagingSenderId: "332116024676",
    appId: "1:332116024676:web:28063685714f6ef0c16e71",
    measurementId: "G-7WDMBTP78W"
  };

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: firebaseConfig.projectId,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,  // จากไฟล์ .env
            privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')  // จากไฟล์ .env
        }),
        databaseURL: `https://${firebaseConfig.projectId}.firebaseio.com`
    });
}


// ตั้งค่า Firestore 
const db = admin.firestore();

// ฟังก์ชันสำหรับดึงข้อมูลทั้งหมดจาก Firestore
const fetchAllChatbotData = async () => {
    try {
        const querySnapshot = await db.collection('datachatbotcontent').get();
        
        if (querySnapshot.empty) {
            console.log('ไม่มีข้อมูลในคอลเล็กชัน');
            return 'ไม่มีข้อมูลในระบบขณะนี้';  // กรณีที่ไม่มีข้อมูลใน Firestore
        }

        let content = '';
        querySnapshot.forEach(doc => {
            const data = doc.data();
            if (data.contentdata && data.contentdata.trim() !== '') {
                // เพิ่มข้อมูลที่ไม่ใช่ข้อความว่างเปล่าเท่านั้น
                content += `คำตอบ: ${data.contentdata.trim()}\n\n`;
            }
        });

        return content !== '' ? content : 'ไม่มีข้อมูลในระบบขณะนี้';  // กรณีที่ไม่มีข้อมูล
    } catch (error) {
        console.error('Error fetching chatbot data:', error);
        return 'เกิดข้อผิดพลาดในการดึงข้อมูลจากระบบ';
    }
};


// ฟังก์ชันสำหรับจัดรูปแบบการตอบกลับของแชทบอท
const formatBotResponse = (messageContent) => {
    // จัดรูปแบบข้อความด้วยการขึ้นบรรทัดใหม่เฉพาะในส่วนที่เป็นลิสต์ร้านอาหาร และจัดตัวหนา
    return messageContent
        .replace(/\n1\./g, '<br><br>1.') // ขึ้นบรรทัดใหม่ก่อนรายการร้านอาหารแรก
        .replace(/(\d\.\n)(\*\*)(.*?)(\*\*)/g, '<br><strong>$3</strong>') // ตัวหนาสำหรับชื่อร้านอาหาร
        .replace(/- เวลาเปิดปิด:/g, '<br>- เวลาเปิดปิด:') // ขึ้นบรรทัดใหม่ก่อนเวลาเปิดปิด
        .replace(/- 📞/g, '<br>- 📞') // ขึ้นบรรทัดใหม่ก่อนเบอร์โทร
        .replace(/- 📌/g, '<br>- 📌') // ขึ้นบรรทัดใหม่ก่อนลิงก์แผนที่
        .replace(/\n\n/g, '<br><br>'); // ขึ้นบรรทัดใหม่ระหว่างร้านอาหาร
};

app.post('/api/generate-text', async (req, res) => {
    const userInput = req.body.message;

    // ดึงข้อมูลทั้งหมดจาก Firebase เพื่อใช้ใน OpenAI
    const chatbotContent = await fetchAllChatbotData();

    if (!chatbotContent) {
        return res.status(500).send("ไม่สามารถดึงข้อมูลจาก Firebase ได้");
    }

    // เตรียมข้อมูลที่จะส่งไปยัง OpenAI API
    const data = {
        model: "gpt-4o-mini",
        messages: [
            {
                role: "system",
                content: `
                    คุณเป็นวัยรุ่นผู้ชาย เป็นนักศึกษาคณะสหวิทยาการ พูดไทย พูดเพราะ ลงท้ายด้วยครับ 
                    ห้ามเขียนโค้ด ห้ามบวกเลขต่างๆ คุณจะตอบคำถามเกี่ยวกับคณะสหวิทยาการ มหาวิทยาลัยขอนแก่น 
                    วิทยาเขตหนองคาย เท่านั้น ตอบกลับตามความเหมาะสมไม่ยาวเกินไป ห้ามตอบยาว 
                    ข้อมูลที่มีในระบบของคุณประกอบไปด้วยคำตอบที่เกี่ยวข้อง ดังนี้:
                    
                    ${chatbotContent}

                    ใช้ข้อมูลนี้ในการตอบคำถามที่ผู้ใช้ถามโดยตรง
                `
            },
            {
                role: "user",
                content: userInput
            }
        ]
    };

    try {
        // เรียก OpenAI API
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        // จัดรูปแบบคำตอบก่อนส่งกลับไปยังผู้ใช้
        let botResponse = result.choices[0].message.content;
        botResponse = formatBotResponse(botResponse);

        // บันทึกคำถามของผู้ใช้ลง Firestore
        const docRef = await db.collection('questions').add({
            question: userInput,
            response: botResponse,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log('บันทึกคำถามเรียบร้อยแล้วที่ ID: ', docRef.id);

        // ส่งคำตอบกลับไปยังผู้ใช้
        res.json({
            choices: [
                {
                    message: {
                        content: botResponse  // ส่งคำตอบที่มีการจัดรูปแบบแล้ว
                    }
                }
            ]
        });

    } catch (error) {
        console.error('An error occurred:', error);
        res.status(500).json({ error: 'An error occurred' });
    }
});


// เปิดเซิร์ฟเวอร์
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
