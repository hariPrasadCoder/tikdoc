const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

async function testModels() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const models = ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-pro"];
  
  for (const modelName of models) {
    try {
      console.log(`Testing: ${modelName}`);
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent("hello");
      const response = await result.response;
      console.log(`✅ ${modelName} is working:`, response.text().substring(0, 20) + "...");
    } catch (err) {
      console.error(`❌ ${modelName} failed:`, err.message);
    }
  }
}

testModels();
