# Setup

1. Copy `.env.example` to `.env` and fill values.

2. Install dependencies:

```bash
npm install
```

3. Development (auto-restart):

```bash
npm run dev
```

4. Production:

```bash
npm start
```

Notes:
- The current entrypoint remains `main.js` for now. `src/index.js` is scaffolded for future refactor.
- Scan the QR code when prompted. The session is persisted in `.wwebjs_auth/`.
