const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const { createClient, LiveTranscriptionEvents } = require("@deepgram/sdk");
const OpenAI = require("openai");
const dotenv = require("dotenv");
dotenv.config();

// Initialize Deepgram and OpenAI clients
const deepgramClient = createClient(process.env.DEEPGRAM_API_KEY);
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let keepAlive;

// Function to send transcript to OpenAI for follow-up questions
async function getFollowUpQuestions(transcript) {
    const prompt = `Here is a part of a sales conversation:\n\n${transcript}\n\nBased on this conversation, suggest one curiosity-driven follow-up question.`;

    const response = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
            { role: "system", content: "You are a helpful assistant." },
            { role: "user", content: prompt }
        ],
        max_tokens: 50, // Adjusted to limit the response length
        temperature: 0.7,
    });

    return response.choices[0].message.content.trim();
}

// Set up Deepgram for live transcription
const setupDeepgram = (ws) => {
    const deepgram = deepgramClient.listen.live({
        language: "en",
        punctuate: true,
        smart_format: true,
        model: "nova",
    });

    if (keepAlive) clearInterval(keepAlive);
    keepAlive = setInterval(() => {
        console.log("deepgram: keepalive");
        deepgram.keepAlive();
    }, 10 * 1000);

    deepgram.addListener(LiveTranscriptionEvents.Open, () => {
        console.log("deepgram: connected");

        // Handle transcript reception and send to OpenAI
        deepgram.addListener(LiveTranscriptionEvents.Transcript, async (data) => {
            if (data.channel && data.channel.alternatives && data.channel.alternatives[0]) {
                const transcript = data.channel.alternatives[0].transcript;
                console.log("deepgram: transcript received");

                // Check if the transcript is not empty and ends with a punctuation mark
                if (transcript.trim() !== "" && /[.!?]$/.test(transcript.trim())) {
                    // Get follow-up questions from OpenAI
                    const followUpQuestions = await getFollowUpQuestions(transcript);
                    console.log("socket: follow-up question sent to client");

                    // Send both transcript and follow-up question back to the client
                    ws.send(JSON.stringify({ transcript, followUpQuestions }));
                } else {
                    console.log("deepgram: received incomplete transcript, not sending to OpenAI");
                }
            } else {
                console.log("deepgram: no valid transcript data received");
            }
        });

        deepgram.addListener(LiveTranscriptionEvents.Close, () => {
            console.log("deepgram: disconnected");
            clearInterval(keepAlive);
            deepgram.finish();
        });

        deepgram.addListener(LiveTranscriptionEvents.Error, (error) => {
            console.log("deepgram: error received");
            console.error(error);
        });

        deepgram.addListener(LiveTranscriptionEvents.Warning, (warning) => {
            console.log("deepgram: warning received");
            console.warn(warning);
        });

        deepgram.addListener(LiveTranscriptionEvents.Metadata, (data) => {
            console.log("deepgram: metadata received");
            ws.send(JSON.stringify({ metadata: data }));
        });
    });

    return deepgram;
};

// Handle WebSocket connections
wss.on("connection", (ws) => {
    console.log("socket: client connected");
    let deepgram = setupDeepgram(ws);

    ws.on("message", (message) => {
        console.log("socket: client data received");

        if (deepgram.getReadyState() === 1) { // OPEN
            console.log("socket: data sent to deepgram");
            deepgram.send(message);
        } else if (deepgram.getReadyState() >= 2) { // CLOSING or CLOSED
            console.log("socket: retrying connection to deepgram");
            deepgram.finish();
            deepgram.removeAllListeners();
            deepgram = setupDeepgram(ws);
        } else {
            console.log("socket: data couldn't be sent to deepgram");
        }
    });

    ws.on("close", () => {
        console.log("socket: client disconnected");
        deepgram.finish();
        deepgram.removeAllListeners();
        deepgram = null;
    });
});

app.use(express.static("public/"));
app.get("/", (req, res) => {
    res.sendFile(__dirname + "/public/index.html");
});

server.listen(3000, () => {
    console.log("Server is listening on port 3000");
});
