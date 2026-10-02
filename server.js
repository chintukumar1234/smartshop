const express = require("express");
const webpush = require("web-push");
const { cert, initializeApp } = require("firebase-admin/app");
const { getDatabase } = require("firebase-admin/database");
const path = require("path");
const fs = require("fs");

const app = express();
const dotenv = require("dotenv");
dotenv.config();
let port = process.env.PORT ||3000;
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, FIREBASE_SERVICE_ACCOUNT, FIREBASE_DATABASE_URL } = process.env;

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    throw new Error("VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be configured in .env");
}

if (!FIREBASE_SERVICE_ACCOUNT || !FIREBASE_DATABASE_URL) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT and FIREBASE_DATABASE_URL must be configured in .env");
}

function loadServiceAccount(rawValue) {
    try {
        return JSON.parse(rawValue);
    } catch (error) {
        const filePath = path.isAbsolute(rawValue) ? rawValue : path.join(__dirname, rawValue);

        if (!fs.existsSync(filePath)) {
            throw new Error("FIREBASE_SERVICE_ACCOUNT must be valid JSON or a path to the JSON service account file");
        }

        try {
            return JSON.parse(fs.readFileSync(filePath, "utf8"));
        } catch (readError) {
            throw new Error(`FIREBASE_SERVICE_ACCOUNT file is not valid JSON: ${readError.message}`);
        }
    }
}

const serviceAccount = loadServiceAccount(FIREBASE_SERVICE_ACCOUNT);

initializeApp({
    credential: cert(serviceAccount),
    databaseURL: FIREBASE_DATABASE_URL
});

const database = getDatabase();

webpush.setVapidDetails(
    "mailto:chintukr32101@gmail.com",
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
);
app.post("/subscribe", async (req, res) => {

    const subscription = req.body;

    if (!subscription.endpoint || !subscription.keys) {
        return res.status(400).json({ message: "Invalid push subscription" });
    }

    try {
        const subscriptionsRef = database.ref("subscriptions");
        const existing = await subscriptionsRef
            .orderByChild("endpoint")
            .equalTo(subscription.endpoint)
            .once("value");

        if (!existing.exists()) {
            await subscriptionsRef.push({
                endpoint: subscription.endpoint,
                keys: subscription.keys
            });
        }

        console.log("Device subscription saved to Firebase");
        res.status(201).json({
            message: "Subscribed successfully"
        });
    } catch (error) {
        console.error("Could not save subscription:", error.message);
        res.status(500).json({ message: "Could not save subscription" });
    }
});


app.post("/send_notification", async (req, res) => {
    const { title, message } = req.body;
    if (!title || !message) {
        return res.status(400).json({ message: "Notification title and message are required" });
    }
    const payload = JSON.stringify({
        title: title,
        message: message
    });

    try {
        const snapshot = await database.ref("subscriptions").once("value");
        if (!snapshot.exists()) {
            return res.status(409).json({ message: "No device is subscribed to notifications" });
        }

        let sentCount = 0;
        const sendTasks = [];

        snapshot.forEach((child) => {
            const subscription = child.val();
            sendTasks.push(
                webpush.sendNotification(subscription, payload)
                    .then(() => {
                        sentCount += 1;
                    })
                    .catch(async (error) => {
                        console.log("Notification error:", error.message);
                        if (error.statusCode === 404 || error.statusCode === 410) {
                            await child.ref.remove();
                        }
                    })
            );
        });

        await Promise.all(sendTasks);

        if (sentCount === 0) {
            return res.status(502).json({ message: "Notification could not be delivered" });
        }

        res.json({
            message: "Notification sent",
            sentCount
        });
    } catch (error) {
        console.error("Could not send notification:", error.message);
        res.status(500).json({ message: "Could not send notification" });
    }
});

app.listen(port, () => {
    console.log(`server is running on port http://localhost:${port}`);
});