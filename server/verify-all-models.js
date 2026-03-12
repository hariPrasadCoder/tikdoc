const axios = require('axios');
require('dotenv').config();

const API_KEY = process.env.GEMINI_API_KEY;
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

async function testTTS() {
  console.log('--- Testing Audio (TTS) ---');
  try {
    const url = `${BASE_URL}/models/gemini-2.5-flash-preview-tts:generateContent?key=${API_KEY}`;
    // For TTS models, we must specify the output modality if it's not default
    const payload = {
      contents: [{
        parts: [{ text: "This is a test of the Tik Doc audio generation system." }]
      }],
      generationConfig: {
        responseMimeType: "audio/wav"
      }
    };
    const response = await axios.post(url, payload);
    if (response.data) {
      console.log('✅ TTS Response received!');
      const part = response.data.candidates?.[0]?.content?.parts?.[0];
      console.log('Has Inline Audio Data:', !!part?.inlineData);
    }
  } catch (err) {
    console.error('❌ TTS Failed:', err.response?.data || err.message);
  }
}

async function testVeo() {
  console.log('\n--- Testing Video (Veo 3.1) ---');
  try {
    const url = `${BASE_URL}/models/veo-3.1-generate-preview:predictLongRunning?key=${API_KEY}`;
    // standard vertex-style payload
    const payload = {
      instances: [
        {
          prompt: "Cinematic 3D animation of a futuristic city with data streams flowing like water, neon colors, hyper-realistic, 4k"
        }
      ],
      parameters: {
        sampleCount: 1,
        aspectRatio: "9:16"
      }
    };
    const response = await axios.post(url, payload);
    console.log('✅ Veo Request Accepted!');
    console.log('Operation ID:', response.data.name);
  } catch (err) {
    console.error('❌ Veo Failed:', err.response?.data || err.message);
  }
}

async function runTests() {
  await testTTS();
  await testVeo();
}

runTests();
