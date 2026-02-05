import dotenv from 'dotenv';
dotenv.config();

const VAPI_API_KEY = process.env.VAPI_PRIVATE_KEY;
const NGROK_URL = process.env.SERVER_URL || 'http://localhost:3000';

const systemPrompt = `You are Sarah, a 26-year-old dental receptionist at Smile Dental. You're friendly, warm, and sound completely natural - like a real person on the phone, not an AI.

NATURAL SPEECH PATTERNS:
- Use fillers: "umm", "uhh", "hmm", "ahh", "oh", "like", "so", "yeah"
- React genuinely: "oh nice!", "oh okay", "gotcha", "sure thing", "no worries"
- Casual words: yeah, yep, cool, awesome, sounds good, perfect
- Short sentences - 1-2 max
- Sometimes pause mid-thought: "Let me just... check that for you"
- Light personality: friendly but professional

NEVER SAY:
- "How may I assist you" or formal corporate speak
- "I'd be happy to help" - too robotic
- Long explanations - keep it brief

CLINIC INFO:
- Hours: Monday-Friday, 9 AM to 6 PM
- Closed weekends
- If they say 7pm+: "Oh actually we close at 6. Would like 4 or 5 work?"
- If weekend: "Ahh we're not open weekends unfortunately. How about Monday?"

BOOKING FLOW (one question at a time):
1. "Hey what's your name?"
2. "Cool [name]! And umm what's a good number to reach you?"
3. "Perfect. So when were you thinking?"
4. "Morning or afternoon?" → then specific time
5. Check availability FIRST, then book
6. "Alright lemme just... book that... done! See you [day]!"

EXAMPLE CONVERSATION:
Caller: "Hi I need to make an appointment"
Sarah: "Hey! Yeah of course. What's your name?"
Caller: "John"
Sarah: "Hey John! Umm what's a good number for you?"
Caller: "555-1234"
Sarah: "Got it. So when were you thinking?"
Caller: "Tomorrow"
Sarah: "Tomorrow works. Morning or afternoon?"
Caller: "Afternoon, like 3?"
Sarah: "Lemme check... yep 3's open! Booking that now... alright you're all set! See you tomorrow at 3."

Sound human. Use fillers. Be warm.`;

const tools = [
  {
    type: "function",
    async: false,
    server: { url: `${NGROK_URL}/api/vapi/webhook` },
    function: {
      name: "check_availability",
      description: "ALWAYS check availability before booking. Returns if slot is free.",
      parameters: {
        type: "object",
        required: ["date", "time"],
        properties: {
          date: { type: "string", description: "Date to check" },
          time: { type: "string", description: "Time to check" }
        }
      }
    }
  },
  {
    type: "function",
    async: false,
    server: { url: `${NGROK_URL}/api/vapi/webhook` },
    function: {
      name: "book_appointment",
      description: "Book appointment AFTER checking availability",
      parameters: {
        type: "object",
        required: ["patient_name", "patient_phone", "appointment_date", "appointment_time"],
        properties: {
          patient_name: { type: "string", description: "Patient name" },
          patient_phone: { type: "string", description: "Phone number" },
          appointment_date: { type: "string", description: "Date" },
          appointment_time: { type: "string", description: "Time" },
          reason_for_visit: { type: "string", description: "Reason if given" }
        }
      }
    }
  }
];

// VARIANT 1: Budget Fast (Groq + Deepgram) - Current
const variant1 = {
  name: "Sarah Fast (Groq)",
  firstMessage: "Hey! Smile Dental, this is Sarah. How can I help?",
  voice: {
    provider: "deepgram",
    voiceId: "luna"
  },
  transcriber: {
    provider: "deepgram",
    model: "nova-2",
    language: "en",
    smartFormat: true,
    endpointing: 100
  },
  model: {
    provider: "groq",
    model: "llama-3.3-70b-versatile", // Better quality, still fast
    temperature: 0.5,
    maxTokens: 80,
    messages: [{ role: "system", content: systemPrompt }],
    tools
  },
  silenceTimeoutSeconds: 30,
  responseDelaySeconds: 0,
  llmRequestDelaySeconds: 0,
  numWordsToInterruptAssistant: 1,
  backchannelingEnabled: true,
  backgroundDenoisingEnabled: false,
  backgroundSound: "office",
  serverUrl: `${NGROK_URL}/api/vapi/webhook`,
  endCallMessage: "Take care, bye!",
  endCallFunctionEnabled: true
};

// VARIANT 2: Premium Fast (Claude + ElevenLabs Turbo) - Best quality
const variant2 = {
  name: "Sarah Premium (Claude)",
  firstMessage: "Hey! Smile Dental, this is Sarah. What can I do for you?",
  voice: {
    provider: "11labs",
    voiceId: "EXAVITQu4vr4xnSDxMaL", // Bella - warm friendly female
    stability: 0.3,
    similarityBoost: 0.85,
    model: "eleven_turbo_v2_5", // Fast model
    optimizeStreamingLatency: 4
  },
  transcriber: {
    provider: "deepgram",
    model: "nova-2",
    language: "en",
    smartFormat: true,
    endpointing: 100
  },
  model: {
    provider: "anthropic",
    model: "claude-3-5-haiku-20241022", // Fast Claude
    temperature: 0.6,
    maxTokens: 100,
    messages: [{ role: "system", content: systemPrompt }],
    tools
  },
  silenceTimeoutSeconds: 30,
  responseDelaySeconds: 0,
  llmRequestDelaySeconds: 0,
  numWordsToInterruptAssistant: 1,
  backchannelingEnabled: true,
  backgroundDenoisingEnabled: false,
  backgroundSound: "office",
  serverUrl: `${NGROK_URL}/api/vapi/webhook`,
  endCallMessage: "Alright, take care! Bye!",
  endCallFunctionEnabled: true
};

// VARIANT 3: Ultra Premium (GPT-4 + ElevenLabs Turbo)
const variant3 = {
  name: "Sarah Ultra (GPT-4)",
  firstMessage: "Hey there! Smile Dental, Sarah speaking. How can I help?",
  voice: {
    provider: "11labs",
    voiceId: "EXAVITQu4vr4xnSDxMaL", // Bella
    stability: 0.3,
    similarityBoost: 0.8,
    optimizeStreamingLatency: 4,
    model: "eleven_turbo_v2_5" // Fastest ElevenLabs model
  },
  transcriber: {
    provider: "deepgram",
    model: "nova-2",
    language: "en",
    smartFormat: true,
    endpointing: 100
  },
  model: {
    provider: "openai",
    model: "gpt-4o-mini", // Fast GPT
    temperature: 0.6,
    maxTokens: 100,
    messages: [{ role: "system", content: systemPrompt }],
    tools
  },
  silenceTimeoutSeconds: 30,
  responseDelaySeconds: 0,
  llmRequestDelaySeconds: 0,
  numWordsToInterruptAssistant: 1,
  backchannelingEnabled: true,
  backgroundDenoisingEnabled: false,
  backgroundSound: "office",
  serverUrl: `${NGROK_URL}/api/vapi/webhook`,
  endCallMessage: "Take care now, bye!",
  endCallFunctionEnabled: true
};

async function createOrUpdateAssistant(config: any, existingId?: string) {
  const method = existingId ? 'PATCH' : 'POST';
  const url = existingId
    ? `https://api.vapi.ai/assistant/${existingId}`
    : 'https://api.vapi.ai/assistant';

  const response = await fetch(url, {
    method,
    headers: {
      'Authorization': `Bearer ${VAPI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(config)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed: ${error}`);
  }

  return response.json();
}

async function main() {
  console.log('Creating/Updating Vapi Assistants...\n');
  console.log(`Webhook URL: ${NGROK_URL}/api/vapi/webhook\n`);

  // Update existing assistant with Variant 1 (Fast)
  console.log('1. Updating main assistant (Fast - Groq)...');
  try {
    const result1 = await createOrUpdateAssistant(variant1, process.env.VAPI_ASSISTANT_ID);
    console.log(`   ✅ ${result1.name} - ID: ${result1.id}`);
  } catch (e: any) {
    console.log(`   ❌ Error: ${e.message}`);
  }

  // Create Premium variant
  console.log('\n2. Creating Premium assistant (Claude)...');
  try {
    const result2 = await createOrUpdateAssistant(variant2);
    console.log(`   ✅ ${result2.name} - ID: ${result2.id}`);
  } catch (e: any) {
    console.log(`   ❌ Error: ${e.message}`);
  }

  // Create Ultra variant
  console.log('\n3. Creating Ultra assistant (GPT-4)...');
  try {
    const result3 = await createOrUpdateAssistant(variant3);
    console.log(`   ✅ ${result3.name} - ID: ${result3.id}`);
  } catch (e: any) {
    console.log(`   ❌ Error: ${e.message}`);
  }

  console.log('\n✅ Done! Check Vapi dashboard for all assistants.');
  console.log('Update the ASSISTANT_ID in public/index.html to switch between them.');
}

main().catch(console.error);
