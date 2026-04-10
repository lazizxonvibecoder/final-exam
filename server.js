const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
// Allow CORS for Vercel frontend
app.use(cors({
  origin: 'https://final-exam-three-topaz.vercel.app',
  methods: ['GET', 'POST'],
  credentials: false
}));
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Load questions
const questions = JSON.parse(fs.readFileSync(path.join(__dirname, 'questions.json'), 'utf8'));

// Ensure answers directory exists
const answersDir = path.join(__dirname, 'answers');
if (!fs.existsSync(answersDir)) {
  fs.mkdirSync(answersDir);
}

// Track active exam sessions (in memory)
const sessions = new Map();

// Start exam - assigns 20 random questions
app.post('/api/start', (req, res) => {
  const { firstName, lastName } = req.body;

  if (!firstName || !lastName || !firstName.trim() || !lastName.trim()) {
    return res.status(400).json({ error: "Ism va familiya kiritilishi shart" });
  }

  const sanitizedFirst = firstName.trim().replace(/[^a-zA-Z0-9\u0400-\u04FFʻʼ'' -]/g, '');
  const sanitizedLast = lastName.trim().replace(/[^a-zA-Z0-9\u0400-\u04FFʻʼ'' -]/g, '');

  // Pick 20 random questions
  const shuffled = [...questions].sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, 20);

  const sessionId = crypto.randomUUID();
  sessions.set(sessionId, {
    firstName: sanitizedFirst,
    lastName: sanitizedLast,
    questions: selected,
    startTime: new Date().toISOString()
  });

  // Return questions without correct answers
  const clientQuestions = selected.map((q, index) => ({
    number: index + 1,
    id: q.id,
    question: q.question,
    options: q.options
  }));

  res.json({ sessionId, questions: clientQuestions });
});

// Submit answers
app.post('/api/submit', (req, res) => {
  const { sessionId, answers } = req.body;

  if (!sessionId || !sessions.has(sessionId)) {
    return res.status(400).json({ error: "Noto'g'ri sessiya" });
  }

  const session = sessions.get(sessionId);

  // Build result object with auto-grading
  let correctCount = 0;
  const gradedAnswers = session.questions.map((q, i) => {
    const studentAnswer = answers[q.id] || 'Javob berilmagan';
    const isCorrect = studentAnswer === q.correct;
    if (isCorrect) correctCount++;
    return {
      questionId: q.id,
      question: q.question,
      options: q.options,
      correctAnswer: q.correct,
      studentAnswer,
      isCorrect
    };
  });

  const result = {
    firstName: session.firstName,
    lastName: session.lastName,
    startTime: session.startTime,
    submitTime: new Date().toISOString(),
    score: correctCount,
    totalQuestions: 20,
    answers: gradedAnswers
  };

  // Save to file
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${session.lastName}_${session.firstName}_${timestamp}.json`;
  const filePath = path.join(answersDir, filename);

  fs.writeFileSync(filePath, JSON.stringify(result, null, 2), 'utf8');

  // Remove session
  sessions.delete(sessionId);

  res.json({ success: true });
});

// Admin endpoint - list all submissions
app.get('/api/admin/results', (req, res) => {
  const files = fs.readdirSync(answersDir).filter(f => f.endsWith('.json'));
  const results = files.map(f => {
    const data = JSON.parse(fs.readFileSync(path.join(answersDir, f), 'utf8'));
    return {
      file: f,
      firstName: data.firstName,
      lastName: data.lastName,
      submitTime: data.submitTime,
      answeredCount: data.answers.filter(a => a.studentAnswer !== 'Javob berilmagan').length,
      score: data.score !== undefined ? data.score : '-',
      totalQuestions: data.totalQuestions || 20
    };
  });
  res.json(results);
});

// Admin endpoint - get specific submission
app.get('/api/admin/results/:filename', (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(answersDir, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Natija topilmadi' });
  }

  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  res.json(data);
});

app.listen(PORT, () => {
  console.log(`Imtihon serveri ishga tushdi: http://localhost:${PORT}`);
  console.log(`Natijalarni ko'rish: http://localhost:${PORT}/admin.html`);
});
