require('dotenv').config();
const express = require('express');
const cors = require('cors');

const nowplaying = require('./routes/nowplaying');
const playlists = require('./routes/playlists');
const djs = require('./routes/djs');
const schedule = require('./routes/schedule');
const requests = require('./routes/requests');
const releases = require('./routes/releases');

const app = express();

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map((o) => o.trim());

app.use(express.json());

app.use(
  cors({
    origin(origin, callback) {
      // Allow requests with no origin (curl, server-to-server)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: ${origin} not allowed`));
      }
    },
  })
);

app.use('/api/nowplaying', nowplaying);
app.use('/api/playlists', playlists);
app.use('/api/djs', djs);
app.use('/api/schedule', schedule);
app.use('/api/requests', requests);
app.use('/api/releases', releases);

app.get('/api/health', (req, res) => res.json({ ok: true }));

const port = parseInt(process.env.PORT) || 3001;
app.listen(port, '127.0.0.1', () => {
  console.log(`wxdu-api listening on 127.0.0.1:${port}`);
});
