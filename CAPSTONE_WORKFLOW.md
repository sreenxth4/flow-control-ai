# 🎓 Capstone Project Workflow & Architecture Guide

This document outlines the workflow, automated CI/CD pipeline, and system architecture for the **Flow Control AI — Traffic Flow Analysis & Signal Optimization** project on the `capstone-workflow` branch.

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        DATA INPUT LAYER                            │
│   Traffic Camera Feed / Video File  →  Frame Sampler               │
└─────────────────────────┬───────────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────────┐
│                   PERCEPTION & AI PIPELINE                         │
│   YOLOv9 Vehicle Detector → Vehicle Tracker → Density Analyzer     │
│                                  (DeepSORT)      (PCU Weighting)   │
└─────────────────────────┬───────────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────────┐
│                 DECISION ENGINE & OPTIMIZATION                     │
│   Max-Pressure Signal Optimizer  |  Dijkstra + OSRM Dynamic Route  │
└─────────────────────────┬───────────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────────┐
│                   PRESENTATION & CONTROL                           │
│   Interactive Leaflet Map  →  Admin Dashboard & User Portal        │
│   (React + TypeScript + Vite + shadcn/ui + Tailwind CSS)           │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🔄 Development & Branching Model

| Branch               | Purpose                                          |
|----------------------|--------------------------------------------------|
| `main`               | Production-ready, stable release                 |
| `capstone-workflow`  | Active development & capstone feature integration |

### Pull Request Workflow
1. Develop features on `capstone-workflow`.
2. Push commits — CI runs automatically.
3. Open a PR from `capstone-workflow` → `main` when ready.
4. Merge after CI passes and review is complete.

---

## ⚙️ CI/CD Pipeline (`.github/workflows/ci.yml`)

Automated validation runs on every `push` and `pull_request` targeting `capstone-workflow` or `main`:

| Job              | What it does                                                      |
|------------------|-------------------------------------------------------------------|
| **Frontend CI**  | Installs Node.js 20 dependencies, runs `npm run build`            |
| **Backend CI**   | Sets up Python 3.10, installs core deps, runs `py_compile` checks |

### Trigger Events
- Push to `main` or `capstone-workflow`
- Pull requests targeting `main` or `capstone-workflow`

---

## 🚀 Local Development Setup

### Backend
```bash
cd backend
pip install -r requirements.txt
python run.py
```
- API Endpoint: `http://localhost:5000`

### Frontend
```bash
npm install
npm run dev
```
- Web Interface: `http://localhost:5173`

---

## 📊 Module Pipeline & Evaluation

| Module                  | Algorithm / Model          | Purpose                                           |
|-------------------------|----------------------------|---------------------------------------------------|
| `yolo_v9_detector.py`   | YOLOv9c                   | Vehicle class detection (Car, Bus, Truck, Motorcycle) |
| `tracker.py`            | DeepSORT-style             | Multi-object tracking & speed estimation           |
| `density_analyzer.py`   | PCU (Passenger Car Units)  | Weighted density computation per road segment      |
| `signal_optimizer.py`   | Max-Pressure               | Adaptive green-phase timing across junctions       |
| `route_optimizer.py`    | Dijkstra + OSRM            | Traffic-aware shortest path with road geometries   |
| `network_model.py`      | Graph model                | Road network representation                        |
| `traffic_state.py`      | State manager              | Live traffic state aggregation                     |
| `video_processor.py`    | Frame pipeline             | Video frame extraction & processing                |

---

## 📄 License

This project is for educational and research purposes.
