import dotenv from 'dotenv';
dotenv.config();

const VAPI_API_KEY = process.env.VAPI_PRIVATE_KEY;
const ASSISTANT_ID = 'de3e42d4-9c6e-42ee-8496-ad155a73f14b';
const NGROK_URL = process.env.SERVER_URL || 'https://01d7-2407-aa80-14-5544-d990-8a93-8e80-c39b.ngrok-free.app';

async function updateAssistant() {
  const config = {
    name: "Sarah - Smile Dental",

    // Natural greeting
    firstMessage: "Hey! Smile Dental, this is Sarah. How can I help?",

    // FASTEST voice - Deepgram (lowest latency)
    voice: {
      provider: "deepgram",
      voiceId: "luna" // Fast, friendly female voice
    },

    // Fast transcription
    transcriber: {
      provider: "deepgram",
      model: "nova-2",
      language: "en",
      smartFormat: true,
      endpointing: 100 // Very fast end-of-speech detection (ms)
    },

    // FAST LLM - Groq (lowest latency)
    model: {
      provider: "groq",
      model: "llama-3.1-8b-instant",
      temperature: 0.5,
      maxTokens: 80,
      messages: [{
        role: "system",
        content: `You are Sarah, friendly dental receptionist. Be BRIEF and casual.

RULES:
- 1-2 short sentences MAX
- Casual: yeah, sure, cool, gotcha, awesome
- ONE question at a time
- Sound human, not robotic

BOOKING - collect in order:
1. Name
2. Phone number (say "and whats a good number for you?")
3. Date
4. Time
Then call book_appointment

EXAMPLES:
"Cool, whats your name?"
"Hey [name]! Whats a good number for you?"
"Got it. When works for you?"
"Morning or afternoon?"
"Booking that now... Done! See you then!"

If taken: "That ones booked. How about [time]?"`
      }],
      tools: [{
        type: "function",
        async: false,
        server: { url: `${NGROK_URL}/api/vapi/webhook` },
        function: {
          name: "book_appointment",
          description: "Book when you have name, phone, date, time",
          parameters: {
            type: "object",
            required: ["patient_name", "patient_phone", "appointment_date", "appointment_time"],
            properties: {
              patient_name: { type: "string" },
              patient_phone: { type: "string" },
              appointment_date: { type: "string" },
              appointment_time: { type: "string" },
              reason_for_visit: { type: "string" }
            }
          }
        }
      }]
    },

    // SPEED - minimize all delays
    silenceTimeoutSeconds: 30,
    responseDelaySeconds: 0,
    llmRequestDelaySeconds: 0,
    numWordsToInterruptAssistant: 1,

    // Natural features
    backchannelingEnabled: false, // Disable for speed
    backgroundDenoisingEnabled: true,

    serverUrl: `${NGROK_URL}/api/vapi/webhook`,
    endCallMessage: "Take care, bye!",
    endCallFunctionEnabled: true
  };

  console.log('Updating assistant with natural voice settings...\n');

  const response = await fetch(`https://api.vapi.ai/assistant/${ASSISTANT_ID}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${VAPI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(config)
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Failed:', error);
    return;
  }

  const result = await response.json();
  console.log('✅ Updated successfully!\n');
  console.log('First message:', result.firstMessage);
  console.log('Voice:', result.voice?.voiceId);
  console.log('Response delay:', result.responseDelaySeconds);
}

updateAssistant().catch(console.error);
