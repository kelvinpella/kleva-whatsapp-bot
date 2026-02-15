# Project Structure

This document describes the reorganized project structure for scalability and maintainability.

## Directory Layout

```
kleva-whatsapp-bot/
├── src/
│   ├── index.js                          # Main entry point
│   ├── config/
│   │   └── index.js                      # Application configuration
│   ├── core/
│   │   ├── whatsapp.js                   # WhatsApp client initialization & events
│   │   └── database.js                   # Supabase database handler
│   ├── features/
│   │   ├── imageSearch/                  # Image search feature
│   │   │   ├── handlers/
│   │   │   │   ├── groupHandler.js       # Group chat handlers (placeholder)
│   │   │   │   ├── messageHandler.js     # Main message routing handler
│   │   │   │   └── searchHandler.js      # Image search logic
│   │   │   └── services/
│   │   │       ├── imageProcessor.js     # Image processing & ML embeddings
│   │   │       ├── similarity.js         # Similarity calculation algorithms
│   │   │       └── textParser.js         # Text parsing utilities
│   │   └── tiktok/                       # TikTok auto-upload feature (future)
│   │       └── README.md                 # Implementation plan reference
│   └── tasks/
│       └── cleanup.js                    # Scheduled cleanup tasks
├── data/
│   ├── images/                           # Uploaded product images
│   └── temp/                             # Temporary files
├── .wwebjs_auth/                         # WhatsApp session data
├── logs/                                 # Application logs (future)
├── package.json                          # Dependencies & scripts
├── .env                                  # Environment variables
├── TIKTOK_IMPLEMENTATION_PLAN.md         # TikTok feature implementation plan
└── PROJECT_STRUCTURE.md                  # This file
```

## Design Principles

### 1. **Feature-Based Organization**
Each major feature has its own directory under `src/features/`:
- `imageSearch/` - Current image indexing and search functionality
- `tiktok/` - Future TikTok auto-upload functionality

This makes it easy to:
- Add new features without affecting existing ones
- Understand feature boundaries
- Enable/disable features independently

### 2. **Core Infrastructure Separation**
Core services live in `src/core/`:
- `whatsapp.js` - WhatsApp client management (shared across features)
- `database.js` - Database operations (shared across features)

### 3. **Clear Responsibility Layers**

Each feature follows a consistent structure:
```
feature/
├── handlers/       # Handle incoming events/messages
├── services/       # Business logic & processing
├── queue/          # Background job processing (if needed)
└── utils/          # Feature-specific utilities
```

### 4. **Scalability**
- Easy to add new features (create new directory under `features/`)
- Easy to split into microservices (each feature can become a service)
- Easy to test (features are isolated)
- Easy to maintain (clear separation of concerns)

## Key Files

### Entry Point
- **`src/index.js`** - Application entry point
  - Initializes database
  - Sets up WhatsApp client
  - Registers event handlers
  - Handles graceful shutdown

### Configuration
- **`src/config/index.js`** - Centralized configuration
  - Environment variables
  - Feature flags
  - Application settings

### Core Modules
- **`src/core/whatsapp.js`** - WhatsApp client wrapper
  - Client initialization
  - Event handler setup
  - Connection management

- **`src/core/database.js`** - Database abstraction
  - Supabase client
  - CRUD operations
  - Data queries

### Image Search Feature
- **`src/features/imageSearch/handlers/messageHandler.js`**
  - Routes group vs private messages
  - Handles image indexing from supplier groups
  - Handles search queries from private chats

- **`src/features/imageSearch/services/imageProcessor.js`**
  - Image validation
  - Thumbnail generation
  - ML embedding extraction (MobileNet)
  - Feature extraction (texture, color)

- **`src/features/imageSearch/services/similarity.js`**
  - Cosine similarity calculation
  - Multi-feature matching algorithms

## Adding a New Feature

To add a new feature (e.g., `analytics`):

1. Create feature directory:
   ```bash
   mkdir -p src/features/analytics/{handlers,services}
   ```

2. Create handler:
   ```javascript
   // src/features/analytics/handlers/statsHandler.js
   async function handleStatsRequest(msg, db) {
     // Implementation
   }
   module.exports = { handleStatsRequest };
   ```

3. Register in main entry point:
   ```javascript
   // src/index.js
   const { handleStatsRequest } = require('./features/analytics/handlers/statsHandler');

   // In message handler
   if (msg.body === '/stats') {
     await handleStatsRequest(msg, db);
   }
   ```

## Migration Notes

### Changes from Old Structure
- ✅ Removed duplicate entry points (`main.js`, `src/bot.js`)
- ✅ Removed unused SQLite database (`src/db.js`)
- ✅ Consolidated configuration into `src/config/`
- ✅ Moved handlers to feature-specific directories
- ✅ Centralized WhatsApp client management
- ✅ Prepared structure for TikTok feature

### Updated Import Paths
- `require('./config')` → `require('../../../config')` (from feature handlers)
- `require('./bot')` → `require('./core/whatsapp')` (from index.js)
- `require('./supabaseDb')` → `require('./core/database')` (from index.js)

## Environment Variables

See `.env.example` for required configuration:
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_KEY` - Supabase API key
- `SUPPLIER_GROUP_IDS` - Comma-separated WhatsApp group IDs
- `CLEANUP_DAYS` - Days to keep old products
- Feature flags for enabling/disabling features

## Running the Application

```bash
# Production
npm start

# Development (with auto-reload)
npm run dev
```

## Future Enhancements

- [ ] Add `src/utils/logger.js` for structured logging
- [ ] Add `src/middleware/` for shared middleware
- [ ] Add tests in `src/features/*/tests/`
- [ ] Implement TikTok feature in `src/features/tiktok/`
- [ ] Add API server in `src/api/` (if needed)

---

**Last Updated**: 2026-02-12
**Version**: 2.0 (Reorganized Structure)
