# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a network visualization project built with React that displays both external (global) and internal network topology views. The application provides a security monitoring dashboard with real-time visualization of network traffic and threat detection.

## Key Architecture

### Frontend Structure
- **Main App**: Single-component architecture centered around `Dashboards.jsx`
- **ExternalNetwork**: 3D globe visualization using `react-globe.gl` with 2D map fallback using `react-simple-maps`
- **InternalNetwork**: 3D network topology using `react-force-graph-3d` showing layered network architecture
- **Dashboard Layout**: Three-panel layout (menu, main visualization, event log)

### Backend API (DB.py)
- **FastAPI** server providing data endpoints
- **Neo4j** integration for graph database nodes (`/neo4j/nodes`)  
- **MongoDB** integration for document data (`/mongo/movies`)
- CORS enabled for frontend development

### Data Flow
- Arc data for network connections defined in `src/arcs.js`
- Network layers defined with specific node counts and positioning
- Real-time event log display (currently static demo data)

## Development Commands

### Frontend (React)
```bash
npm start          # Development server on localhost:3000
npm test           # Run test suite
npm run build      # Production build
```

### Backend (Python)
```bash
# Install dependencies (inferred from imports)
pip install fastapi uvicorn neo4j pymongo

# Run FastAPI server (not in package.json - run manually)
uvicorn DB:app --reload
```

## Key Dependencies
- **Visualization**: react-globe.gl, react-force-graph-3d, react-simple-maps, three.js
- **Backend**: FastAPI, Neo4j driver, PyMongo
- **Testing**: Jest, React Testing Library

## Component Structure
- `src/components/Dashboards.jsx` - Main dashboard container
- `src/components/ExternalNetwork.jsx` - Global network view with 3D/2D toggle
- `src/components/InternalNetwork.jsx` - Internal network topology with 6 layers
- `src/components/DashboardMenu.jsx` - Side navigation menu
- `src/components/GraphUtil.jsx` - Network graph utilities
- `src/arcs.js` - Network connection data

## Network Topology
Internal network uses 6-layer architecture:
1. Device Layer (6 nodes)
2. Access Layer (3 nodes) 
3. Distribution Layer (2 nodes)
4. Core Layer (1 node)
5. DMZ Layer (3 nodes)
6. Server Layer (4 nodes)

## Database Connections
- **Neo4j**: bolt://223.195.38.211:7687 (credentials in DB.py)
- **MongoDB**: Cloud Atlas cluster (credentials in DB.py)