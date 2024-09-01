var express = require('express');
var cors = require('cors');
var multer = require('multer');
var fs = require('fs'); // For createReadStream
var fsPromises = require('fs').promises; // For promise-based operations
var path = require('path');
var app = express();
var Groq = require('groq-sdk');
require('dotenv').config();

const debug = true; // Set to false to disable debug logs

app.use(cors());
app.use(express.json());

const port = 4000;
var corsOptions = {
  origin: 'http://localhost:3000',
  optionsSuccessStatus: 200
};

const client = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const upload = multer({ dest: 'uploads/' });

async function getGroqCompletion(question) {
  try {
    if (debug) console.log('Fetching Groq completion for question:', question);

    // Correctly reading the system prompt file with utf8 encoding
    const systemPrompt = await fsPromises.readFile('system_prompt.txt', 'utf8');

    const chatCompletion = await client.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt }, // Correctly pass the content
        { role: 'user', content: question }
      ],
      model: 'llama3-8b-8192',
    });

    return chatCompletion.choices[0].message.content;
  } catch (error) {
    console.error('Error fetching completion from Groq:', error);
    return 'Error fetching data from Groq';
  }
}

app.post('/groq', cors(corsOptions), async function (req, res) {
  const { question } = req.body;
  if (debug) console.log('Received Groq request with question:', question);
  const completion = await getGroqCompletion(question);
  res.json({ completion });
  console.log("Responded to Groq request");
});

app.post('/whisper', cors(corsOptions), upload.single('audio'), async (req, res) => {
  let audioPath = req.file.path;
  const audioPathWithExtension = `${audioPath}.webm`;

  if (debug) console.log('Received audio file:', audioPath);

  try {
    // Rename the file to add the .webm extension
    await fsPromises.rename(audioPath, audioPathWithExtension);
    audioPath = audioPathWithExtension; // Update the path to the renamed file

    // Use Groq SDK to transcribe the audio
    const transcription = await client.audio.transcriptions.create({
      file: fs.createReadStream(audioPath), // Correctly using fs.createReadStream
      model: "distil-whisper-large-v3-en", // Specify the model to use for transcription
      prompt: "Specify context or spelling", // Optional
      response_format: "json", // Optional
      language: "en", // Optional
      temperature: 0.0, // Optional
    });

    if (debug) console.log('Transcription:', transcription.text);

    const groqResponse = await getGroqCompletion(transcription.text);
    if (debug) console.log('Groq response:', groqResponse);

    res.json({ transcription: transcription.text, groqResponse });

  } catch (err) {
    console.error(`Error processing transcription or Groq request: ${err.message}`);
    res.status(500).json({ error: 'Error processing request' });
  } finally {
    fsPromises.unlink(audioPath).catch((err) => {
      if (err) console.error(`Error deleting file: ${err.message}`);
    });
  }
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
