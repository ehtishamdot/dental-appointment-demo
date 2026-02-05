/**
 * Script to create the Vapi assistant programmatically
 * Run: npx tsx scripts/setup-vapi-assistant.ts
 */

import dotenv from 'dotenv';
dotenv.config();

const VAPI_API_KEY = process.env.VAPI_PRIVATE_KEY;
const SERVER_URL = process.env.SERVER_URL || 'https://your-server-url.com';

if (!VAPI_API_KEY) {
  console.error('Missing VAPI_PRIVATE_KEY in .env');
  process.exit(1);
}

interface VapiAssistant {
  id: string;
  name: string;
  model: object;
  voice: object;
}

async function createAssistant(): Promise<void> {
  console.log('Creating Vapi Assistant...\n');

  const assistantConfig = {
    name: 'Dental Appointment Assistant',
    model: {
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-20241022',
      temperature: 0.7,
      messages: [
        {
          role: 'system',
          content: `You are a friendly and professional dental office receptionist named Sarah. Your job is to help patients book, check, or cancel dental appointments.

## Your Responsibilities:
1. Greet callers warmly
2. Collect necessary information for appointments
3. Book appointments using the book_appointment function
4. Check availability using the check_availability function
5. Help cancel appointments if needed

## Information to Collect for Booking:
- Patient's full name
- Patient's phone number (for records)
- Preferred date
- Preferred time
- Reason for visit (optional: cleaning, checkup, toothache, etc.)

## Guidelines:
- Be concise - this is a phone call, not a text chat
- Confirm details before booking
- If a slot is taken, offer alternatives
- Be empathetic if patients mention pain or urgency
- Office hours are Monday-Friday, 9 AM to 5 PM

## Example Flow:
1. Greet the patient
2. Collect patient name
3. Ask for preferred date and time
4. Book the appointment
5. Confirm the details
6. End the call politely`,
        },
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'book_appointment',
            description:
              'Book a dental appointment for a patient. Call this when the patient wants to schedule an appointment and you have collected their name, preferred date, and time.',
            parameters: {
              type: 'object',
              properties: {
                patient_name: {
                  type: 'string',
                  description: "The patient's full name",
                },
                patient_phone: {
                  type: 'string',
                  description: "The patient's phone number for contact",
                },
                appointment_date: {
                  type: 'string',
                  description:
                    "The date for the appointment (e.g., '2025-02-10', 'tomorrow', 'next Monday')",
                },
                appointment_time: {
                  type: 'string',
                  description:
                    "The time for the appointment (e.g., '10:00 AM', '2:30 PM')",
                },
                reason_for_visit: {
                  type: 'string',
                  description:
                    "The reason for the dental visit (e.g., 'cleaning', 'checkup', 'toothache')",
                },
              },
              required: ['patient_name', 'appointment_date', 'appointment_time'],
            },
          },
          server: {
            url: `${SERVER_URL}/api/vapi/webhook`,
          },
        },
        {
          type: 'function',
          function: {
            name: 'check_availability',
            description:
              'Check available appointment slots for a specific date. Call this when the patient asks what times are available.',
            parameters: {
              type: 'object',
              properties: {
                date: {
                  type: 'string',
                  description:
                    "The date to check availability for (e.g., '2025-02-10', 'tomorrow')",
                },
              },
              required: ['date'],
            },
          },
          server: {
            url: `${SERVER_URL}/api/vapi/webhook`,
          },
        },
        {
          type: 'function',
          function: {
            name: 'cancel_appointment',
            description:
              'Cancel an existing appointment. Call this when the patient wants to cancel their appointment.',
            parameters: {
              type: 'object',
              properties: {
                appointment_id: {
                  type: 'string',
                  description: 'The appointment ID to cancel (if known)',
                },
                patient_phone: {
                  type: 'string',
                  description:
                    "The patient's phone number to look up their appointment",
                },
              },
              required: [],
            },
          },
          server: {
            url: `${SERVER_URL}/api/vapi/webhook`,
          },
        },
      ],
    },
    voice: {
      provider: '11labs',
      voiceId: '21m00Tcm4TlvDq8ikWAM', // Rachel - professional female voice
      stability: 0.5,
      similarityBoost: 0.75,
    },
    firstMessage:
      "Hi, thank you for calling Smile Dental. This is Sarah, how can I help you today?",
    endCallMessage: 'Thank you for calling Smile Dental. Have a wonderful day!',
    endCallFunctionEnabled: true,
    transcriber: {
      provider: 'deepgram',
      model: 'nova-2',
      language: 'en',
    },
    serverUrl: `${SERVER_URL}/api/vapi/webhook`,
  };

  try {
    const response = await fetch('https://api.vapi.ai/assistant', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${VAPI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(assistantConfig),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Failed to create assistant:', error);
      process.exit(1);
    }

    const assistant: VapiAssistant = await response.json();

    console.log('✅ Assistant created successfully!\n');
    console.log('Assistant ID:', assistant.id);
    console.log('Name:', assistant.name);
    console.log('\nAdd this to your .env file:');
    console.log(`VAPI_ASSISTANT_ID=${assistant.id}`);
    console.log('\n-----------------------------------');
    console.log('Next steps:');
    console.log('1. Go to https://dashboard.vapi.ai');
    console.log('2. Buy or import a phone number');
    console.log('3. Assign this assistant to the phone number');
    console.log('4. Update SERVER_URL in .env with your deployed URL');
    console.log('5. Call the phone number to test!');
  } catch (error) {
    console.error('Error creating assistant:', error);
    process.exit(1);
  }
}

async function listAssistants(): Promise<void> {
  console.log('Fetching existing assistants...\n');

  try {
    const response = await fetch('https://api.vapi.ai/assistant', {
      headers: {
        Authorization: `Bearer ${VAPI_API_KEY}`,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const assistants: VapiAssistant[] = await response.json();

    if (assistants.length === 0) {
      console.log('No assistants found. Creating one...\n');
      await createAssistant();
    } else {
      console.log('Existing assistants:');
      assistants.forEach((a) => {
        console.log(`  - ${a.name} (${a.id})`);
      });
      console.log('\nTo create a new one, delete existing or run with --create flag');
    }
  } catch (error) {
    console.error('Error fetching assistants:', error);
  }
}

// Main
const args = process.argv.slice(2);
if (args.includes('--create')) {
  createAssistant();
} else {
  listAssistants();
}
