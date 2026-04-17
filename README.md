# Flow Control AI — Traffic Flow Analysis & Signal Optimization

An intelligent traffic management system that combines **real-time vehicle detection** (YOLOv9), **adaptive signal optimization** (Max-Pressure algorithm), and **dynamic route planning** (Dijkstra + OSRM) to optimize urban traffic flow.

🔗 Live Demo: https://flow-control-ai.vercel.app
---

## 📁 Project Structure

```
flow-control-ai/
├── frontend/          # React + Vite + TypeScript web application
│   ├── src/
│   │   ├── components/    # UI components (Map, Dashboard, Panels)
│   │   ├── pages/         # Admin & User pages
│   │   ├── hooks/         # Custom React hooks
│   │   ├── lib/           # API client, utilities, OSRM integration
│   │   └── layouts/       # Admin & User layout wrappers
│   ├── package.json
│   └── vite.config.ts
│
├── backend/           # Flask REST API + ML pipeline
│   ├── app.py             # Main Flask application & API routes
│   ├── run.py             # Application entry point
│   ├── config.py          # Configuration settings
│   ├── modules/
│   │   ├── density_analyzer.py    # Vehicle density analysis
│   │   ├── network_model.py       # Road network graph model
│   │   ├── signal_optimizer.py    # Max-Pressure signal optimization
│   │   ├── route_optimizer.py     # Dijkstra shortest-path routing
│   │   ├── traffic_state.py       # Live traffic state management
│   │   ├── video_processor.py     # Video frame processing pipeline
│   │   └── tracker.py             # Vehicle tracking (DeepSORT-style)
│   ├── detector/
│   │   ├── yolo_v9_detector.py    # YOLOv9 vehicle detection
│   │   └── dummy_detector.py      # Mock detector for testing
│   ├── data/                      # Junction & signal configuration
│   └── requirements.txt
│
└── README.md
```

---

## 🚀 Quick Start

### Prerequisites
- **Node.js** ≥ 18 & **npm**
- **Python** ≥ 3.10
- YOLOv9 model weights (`yolov9c.pt`) — place in `backend/`

### Backend

```bash
cd backend
pip install -r requirements.txt
python run.py
```

The API server starts at `http://localhost:5000`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The dev server starts at `http://localhost:5173`.

---

## ✨ Key Features

| Feature | Description |
|---|---|
| **Real-Time Detection** | YOLOv9-based vehicle detection from traffic camera feeds |
| **Density Analysis** | PCU-weighted density computation per road segment |
| **Signal Optimization** | Max-Pressure algorithm for adaptive green-phase timing |
| **Dynamic Routing** | Live traffic-aware shortest path with OSRM road geometries |
| **Interactive Map** | Leaflet-based map with junction labels, road overlays & heatmaps |
| **Admin Dashboard** | Video upload, detection monitoring, signal control panel |
| **User Portal** | Real-time traffic conditions, route planning & navigation |

---

## 🛠 Tech Stack

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, Leaflet, shadcn/ui
- **Backend:** Python, Flask, YOLOv9, OpenCV, NumPy
- **Algorithms:** Max-Pressure signal control, Dijkstra pathfinding, OSRM routing

---

## 📄 License

This project is for educational and research purposes.
