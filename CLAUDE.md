# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Sefaria is a digital library platform for Jewish texts built with Django backend and React frontend. It manages a large database of interconnected texts with advanced linking, search, and multilingual support.

## Development Commands

### Build & Watch
```bash
npm run build          # Build all bundles  
npm run build-prod     # Production build
npm run watch          # Watch mode for development
npm run w              # Watch shorthand
npm run wc             # Watch client only
```

### Testing
```bash
# Python tests
python manage.py test
pytest

# JavaScript tests
npm run jest           # Jest with watch mode
npm run jest-travis    # CI Jest tests

# E2E tests
npx playwright test    # Playwright E2E tests
npm run test           # Browser test suite
npm run test-one       # Single browser test
```

### Django Management
```bash
python manage.py runserver     # Development server
python manage.py migrate       # Run database migrations
python manage.py collectstatic # Collect static files
./cli                         # Interactive Django shell
```

## Architecture Overview

### Tech Stack
- **Backend**: Django 1.11 with Python 3.7
- **Frontend**: React 16.8.6 with server-side rendering
- **Databases**: MongoDB (primary), PostgreSQL (user data), Redis (cache)
- **Search**: Elasticsearch 8.8.2
- **Build**: Webpack 5 with multiple entry points
- **Task Queue**: Celery with Redis broker

### Key Directories
- `sefaria/` - Main Django application with core models and business logic
- `static/js/` - React components and frontend JavaScript
- `api/` - REST API endpoints
- `reader/` - Text reader interface views
- `sourcesheets/` - Source sheets functionality
- `django_topics/` - Topic management system
- `sefaria/model/` - Core data models (text.py, user_profile.py, etc.)
- `sefaria/model/linker/` - Advanced text linking system

### Build System
- **Multi-bundle setup**: Separate client/server bundles with specialized entry points
- **Server-side rendering**: Node.js server handles React SSR
- **Webpack configuration**: Multiple configs for different build targets
- **Hot reload**: Watch modes for rapid development iteration

### Database Architecture
- **MongoDB**: Primary database for text storage, indexes, and metadata
- **PostgreSQL**: User accounts, profiles, and structured relational data  
- **Redis**: Caching, sessions, and Celery task queue
- **Multi-database routing**: Automatic routing based on model types

### Text Processing System
- **Jagged Arrays**: Custom data structure for complex text hierarchies
- **Advanced Linking**: Sophisticated cross-reference system between texts
- **Multilingual Support**: Hebrew and English with proper RTL handling
- **Search Integration**: Elasticsearch with custom indexing strategies

### Key Models & Components
- **Text Models** (`sefaria/model/text.py`): Core text and index management
- **Linking System** (`sefaria/model/linker/`): Entity recognition and text connections
- **User Profiles** (`sefaria/model/user_profile.py`): User account and preference management
- **API Layer** (`api/`): RESTful endpoints with comprehensive error handling

### Development Patterns
- **Django Apps**: Modular structure with clear separation of concerns
- **React Components**: Mix of functional and class components with hooks
- **Caching Strategy**: Multi-level caching with Redis and Varnish
- **Error Handling**: Structured logging with Sentry integration

### Testing Strategy
- **Unit Tests**: Python pytest for backend, Jest for frontend
- **Integration Tests**: Django test framework for API endpoints
- **E2E Tests**: Playwright with multi-browser support
- **CI/CD**: GitHub Actions with comprehensive test automation

## Development Setup Notes

### Local Configuration
- Copy `sefaria/local_settings_example.py` to `local_settings.py`
- Configure MongoDB, PostgreSQL, and Redis connections
- Set up Elasticsearch instance for search functionality

### Docker Development
```bash
docker-compose up  # Full stack with all required services
```

### Common Development Tasks
- Frontend changes require `npm run watch` for hot reload
- Backend changes need Django server restart
- Database schema changes require migrations
- Static files need collection after frontend builds