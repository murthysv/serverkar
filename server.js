var express = require('express');
var cors = require('cors');
var multer = require('multer');
var fs = require('fs').promises;
var { exec } = require('child_process');
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
    const systemPrompt = await fs.readFile('system_prompt.txt', 'utf8');

    const chatCompletion = await client.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
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

app.post('/groq', cors(corsOptions), async function (req, res, next) {
  const { question } = req.body;
  if (debug) console.log('Received Groq request with question:', question);
  const completion = await getGroqCompletion(question);
  res.json({ completion });
  console.log("Responded to Groq request");
});

app.post('/whisper', cors(corsOptions), upload.single('audio'), (req, res) => {
  const audioPath = req.file.path;
  if (debug) console.log('Received audio file:', audioPath);

  exec(`whisper ${audioPath} --language en --output-json`, async (error, stdout, stderr) => {
    if (error) {
      console.error(`Error processing audio with Whisper: ${error.message}`);
      return res.status(500).json({ error: 'Error processing audio' });
    }

    try {
      if (debug) console.log('Whisper output:', stdout);
      let whisperOutput;
      try {
        whisperOutput = JSON.parse(stdout);
      } catch (parseError) {
        console.error(`Error parsing Whisper output: ${parseError.message}`);
        return res.status(500).json({ error: 'Error parsing Whisper output' });
      }

      const transcription = whisperOutput.text;
      if (debug) console.log('Transcription:', transcription);

      const groqResponse = await getGroqCompletion(transcription);
      if (debug) console.log('Groq response:', groqResponse);

      res.json({ transcription, groqResponse });

    } catch (err) {
      console.error(`Error processing Whisper output or Groq request: ${err.message}`);
      res.status(500).json({ error: 'Error processing request' });
    } finally {
      fs.unlink(audioPath, (err) => {
        if (err) console.error(`Error deleting file: ${err.message}`);
      });
    }
  });
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
