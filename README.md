# 🚑 EmergencySync

### AI-Powered Ambulance-to-Hospital Emergency Coordination Platform

> **EmergencySync connects patients, ambulances, nurses, hospitals, and specialists in real time — enabling hospitals to prepare before the patient arrives.**

EmergencySync is an intelligent emergency coordination platform designed to reduce critical delays between **emergency recognition, ambulance transport, and hospital preparedness**.

Instead of waiting until an emergency patient reaches the hospital, EmergencySync creates a continuous information pipeline from the **patient → ambulance/nurse → AI analysis → selected hospital → relevant specialist**.

---

## 🚨 The Problem

During medical emergencies, valuable time is often lost because:

- 🚑 Ambulances and hospitals lack synchronized information.
- 🏥 Hospitals may not know a critical patient is arriving until arrival.
- ❤️ ECGs, vitals, medical reports, and symptoms may not reach specialists early enough.
- 👨‍⚕️ Specialists may be unavailable when the patient arrives.
- 📍 Patient and ambulance locations are difficult to coordinate.
- 📞 Emergency information is frequently communicated manually through calls.
- ⏱️ Delayed preparation can affect the speed of emergency care.

### The Core Challenge

**How can we help hospitals and specialists prepare for an emergency patient before the patient reaches the hospital?**

---

# 💡 Our Solution

**EmergencySync** creates a real-time emergency communication bridge between patients, ambulance teams, hospitals, and specialists.

The platform allows a patient/family member to:

1. 🏥 Select a hospital.
2. 🚑 Request an ambulance.
3. 📍 Share the patient's location.
4. 📝 Provide symptoms and emergency details.
5. ❤️ Upload ECGs and medical reports.
6. 🤖 Receive AI-assisted emergency categorization.
7. 🚨 Automatically notify the selected hospital.
8. 👨‍⚕️ Alert the relevant specialist team.
9. 📍 Track ambulance and patient location.
10. 🏥 Help the hospital prepare before arrival.

---

# 🔄 How EmergencySync Works

```text
                    👤 PATIENT / FAMILY
                           │
                           ▼
                  📝 Emergency Details
                           │
                  ❤️ ECG / Medical Reports
                           │
                           ▼
                    🤖 AI ANALYSIS
                           │
             ┌─────────────┴─────────────┐
             │                           │
             ▼                           ▼
      Emergency Category            Risk Information
             │                           │
             └─────────────┬─────────────┘
                           ▼
                    🏥 SELECTED HOSPITAL
                           │
                           ▼
                    🚨 EMERGENCY ALERT
                           │
                           ▼
                  👨‍⚕️ SPECIALIST TEAM
                           │
                           ▼
                🏥 PREPARE BEFORE ARRIVAL
                           │
                           ▼
                    🚑 AMBULANCE
                           │
                           ▼
                    📍 LIVE LOCATION
                           │
                           ▼
                    🏥 HOSPITAL ARRIVAL
```

---

# 🤖 AI-Powered Emergency Intelligence

EmergencySync integrates AI into the **backend emergency-analysis workflow**.

The system processes information such as:

- Patient symptoms
- Vital signs
- Medical information
- Emergency description
- Uploaded reports
- ECG-related information

The AI-assisted system categorizes emergencies into relevant medical categories such as:

| Category | Example |
|---|---|
| ❤️ Cardiac | Chest pain, cardiac symptoms |
| 🧠 Neurological | Stroke-like symptoms, seizures |
| 🫁 Respiratory | Breathing difficulty |
| 🚑 Trauma | Accident or physical injury |
| 🌱 Environmental | Heat-related emergencies |
| 🩸 Metabolic | Blood-sugar/metabolic emergencies |
| ☠️ Poisoning | Suspected poisoning |

### ⚠️ Important

EmergencySync is an **emergency coordination and decision-support system**, not a replacement for qualified medical professionals.

AI-generated information is intended to assist communication and prioritization and requires **clinical review**.

---

# ❤️ ECG & Medical Report Support

EmergencySync is designed to make important medical information available during emergency transport.

Patients or ambulance/nursing teams can provide:

- ❤️ ECG reports
- 📄 Medical documents
- 🧪 Test reports
- 📝 Patient information
- 📷 Emergency-related images/files

This information can be transmitted through the emergency workflow so that the receiving hospital can begin preparing before the patient arrives.

---

# 🚑 Ambulance Coordination

EmergencySync provides an ambulance-side workflow for emergency transportation.

### Ambulance workflow

```text
Emergency Request
       ↓
Ambulance receives request
       ↓
Accept Emergency
       ↓
Status → EN ROUTE
       ↓
Patient Location
       ↓
Live Location Sharing
       ↓
Hospital Destination
       ↓
Hospital Arrival
```

The ambulance dashboard provides emergency information needed during transportation and supports location coordination between the patient and ambulance.

---

# 📍 Location & Tracking

EmergencySync uses location services to improve coordination between:

- 👤 Patient
- 🚑 Ambulance
- 🏥 Hospital

The system can display relevant locations and support ambulance-to-patient coordination.

This helps the ambulance team identify the patient's location and allows the patient/hospital side to track the emergency journey.

---

# 🚨 Hospital & Specialist Alerts

One of the key features of EmergencySync is **pre-arrival hospital notification**.

When an emergency is created:

```text
Patient
   ↓
Emergency Created
   ↓
AI Analysis
   ↓
Selected Hospital
   ↓
Hospital Emergency Alert
   ↓
Relevant Specialist
   ↓
Hospital Preparation
```

For example:

### ❤️ Cardiac Emergency

```text
Patient reports chest pain
        ↓
Vitals + ECG information
        ↓
AI categorizes emergency
        ↓
Hospital receives alert
        ↓
Cardiac specialist notified
        ↓
Hospital prepares before arrival
```

If the initially targeted specialist is unavailable, the system can support escalation toward another suitable specialist within the hospital workflow.

---

# 🔊 Emergency Notification & Voice Alert

EmergencySync is designed to make critical alerts difficult to miss.

The emergency notification workflow can provide:

- 🚨 Visual emergency alerts
- 🔊 Audio/voice notifications
- 📢 Incoming emergency indication
- ⚡ Specialist-facing emergency information

This helps ensure that an emergency is not simply buried inside a dashboard.

---

# 👥 Role-Based System

EmergencySync supports different users involved in the emergency journey.

### 👤 Patient / Family

- Create emergency request
- Enter symptoms
- Select hospital
- Request ambulance
- Share location
- Upload ECG/reports
- Track emergency status

### 👩‍⚕️ Nurse / Ambulance Team

- Receive emergency requests
- Accept emergency
- View patient information
- Access emergency reports
- Share/coordinate location
- Update transportation status

### 👨‍⚕️ Specialist

- Receive emergency notifications
- View emergency information
- Review AI-assisted categorization
- Review patient-provided information
- Prepare for incoming patient

### 🏥 Hospital

- Receive incoming emergency information
- Monitor emergency cases
- Coordinate specialist response
- Prepare for patient arrival

---

# 🧠 Emergency Categories

EmergencySync currently organizes emergency cases around:

```text
❤️ Cardiac
🧠 Neurological
🫁 Respiratory
🚑 Trauma
🌱 Environmental
🩸 Metabolic
☠️ Poisoning
```

This categorization helps route emergency information toward the appropriate hospital/specialist workflow.

---

# 🏗️ System Architecture

```text
┌───────────────────────────────────────────────┐
│                 FRONTEND                      │
│                                               │
│ Patient │ Ambulance │ Specialist │ Hospital  │
└───────────────────────┬───────────────────────┘
                        │
                        │ REST API
                        ▼
┌───────────────────────────────────────────────┐
│                 FASTAPI                       │
│                                               │
│ Authentication                                │
│ Emergency Cases                               │
│ AI Analysis                                   │
│ File Uploads                                  │
│ Hospital Coordination                         │
│ Ambulance Management                          │
│ Location Services                             │
│ Voice Assistance                              │
└───────────────────────┬───────────────────────┘
                        │
              ┌─────────┴─────────┐
              ▼                   ▼
        🗄️ SQLite DB         🤖 AI Layer
              │                   │
              ▼                   ▼
        Cases / Users /      Emergency
        Hospitals / etc.     Classification
```

---

# 🛠️ Technology Stack

## Frontend

- ⚛️ React
- TypeScript
- Vite
- Modern responsive UI
- Role-based dashboards

## Backend

- 🐍 Python
- ⚡ FastAPI
- REST APIs
- JWT-based authentication
- CORS

## Database

- 🗄️ SQLite
- SQLAlchemy / ORM-based database operations

## AI

- 🤖 Local AI / LLM-based emergency analysis
- Ollama-based AI workflow
- Backend AI processing
- Emergency categorization
- Confidence/risk-support information

## Maps & Location

- 🗺️ OpenStreetMap
- 📍 Nominatim
- Hospital location search
- Patient/ambulance location coordination

## File & Medical Information

- 📄 Medical report uploads
- ❤️ ECG/report support
- Emergency file handling

---

# 🔌 Backend API

EmergencySync provides APIs for the major components of the platform.

### Health

```http
GET /health
```

### Authentication

```http
POST /api/auth/register
POST /api/auth/login
GET  /api/auth/me
```

### Emergency Cases

```http
POST /api/cases
POST /api/cases/analyze
POST /api/cases/analyze-file
GET  /api/cases/{id}/status
POST /api/cases/{id}/hospital
POST /api/cases/{id}/send-to-hospital
```

### Location

```http
POST /api/cases/{id}/location
```

### Voice Assistance

```http
POST /api/cases/{id}/voice-assist
```

### Ambulance

```http
POST /api/ambulances/book
GET  /api/ambulances/active
POST /api/ambulances/assignment
POST /api/ambulances/patient-location
POST /api/ambulances/location
```

---

# 📁 Project Structure

```text
EmergencySync/
│
├── backend/
│   ├── main.py
│   ├── models.py
│   ├── database/
│   ├── services/
│   ├── uploads/
│   └── ...
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── dashboards/
│   │   └── ...
│   └── ...
│
├── emergencysync.db
├── .env.example
├── requirements.txt
└── README.md
```

---

# ⚙️ Installation & Setup

## 1️⃣ Clone the Repository

```bash
git clone https://github.com/bhavana2007-glitch/EmergencySync.git
cd EmergencySync
```

## 2️⃣ Backend Setup

```bash
cd backend
```

Create a virtual environment:

```bash
python -m venv venv
```

### Windows

```bash
venv\Scripts\activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

---

## 3️⃣ Configure Environment Variables

Create a `.env` file and configure the required environment variables for your local AI/service setup.

Example:

```env
AI_BASE_URL=...
AI_MODEL=...
SECRET_KEY=...
```

> Never commit private API keys, tokens, or secrets to GitHub.

---

## 4️⃣ Start the Backend

```bash
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Backend:

```text
http://127.0.0.1:8000
```

---

# 💻 Frontend Setup

Open a new terminal:

```bash
cd frontend
```

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

The frontend will normally be available at:

```text
http://localhost:5173
```

---

# 🧪 Example Emergency Scenario

### Scenario: Cardiac Emergency

A patient experiences:

> Chest pain + shortness of breath + abnormal vitals

EmergencySync workflow:

```text
👤 Patient
   │
   ├── Symptoms
   ├── Vitals
   └── ECG / Medical Report
          │
          ▼
      🤖 AI Analysis
          │
          ▼
   ❤️ Cardiac Category
          │
          ▼
   🏥 Selected Hospital
          │
          ├───────────────► 🚨 Hospital Alert
          │
          └───────────────► 👨‍⚕️ Specialist Alert
                                  │
                                  ▼
                         🏥 Hospital Preparation
                                  │
                                  ▼
                            🚑 Patient Arrival
```

Instead of starting hospital preparation **after arrival**, EmergencySync aims to start the coordination **during the emergency journey**.

---

# 🌟 What Makes EmergencySync Different?

### 1. 🚑 Pre-Arrival Coordination

Hospitals receive emergency information while the patient is still in transit.

### 2. 🤖 AI-Assisted Emergency Routing

Emergency information can be categorized to support appropriate specialist routing.

### 3. ❤️ ECG & Medical Report Sharing

Important patient information can travel with the emergency case.

### 4. 📍 Ambulance + Patient Location

Location information supports transportation coordination.

### 5. 🚨 Active Emergency Alerts

The system is designed around visible and audible emergency notifications rather than passive dashboard updates.

### 6. 🔄 End-to-End Workflow

EmergencySync connects multiple participants instead of solving only one part of emergency transportation.

---

# 🔐 Security & Safety

EmergencySync handles potentially sensitive emergency information, so security is an important part of the architecture.

The project includes concepts such as:

- 🔑 Authentication
- 🎫 JWT-based authorization
- 👥 Role-based access
- 🔒 Environment-based secrets
- 🌐 CORS configuration
- 🛡️ Backend-controlled processing

### Medical Safety

EmergencySync is a **prototype for emergency coordination and decision support**.

It does **not** replace:

- Doctors
- Nurses
- Ambulance professionals
- Clinical diagnosis
- Emergency medical protocols

All AI-generated information should be reviewed by qualified medical professionals.

---

# 🚀 Future Enhancements

EmergencySync can be extended with:

- 📡 Real-time WebSocket communication
- 🗺️ Advanced ambulance route optimization
- 🚦 Traffic-aware ETA prediction
- 🏥 Real hospital bed/ICU availability
- ❤️ Advanced ECG signal analysis
- 📱 Mobile application
- 🔔 Push notifications
- 📞 Emergency call integration
- 🧠 More advanced medical AI models
- 🌐 Multi-language emergency assistance
- 🔐 Stronger healthcare data security
- 📊 Hospital emergency analytics
- ☁️ Cloud deployment and scalable infrastructure

---

# 🏆 Project Vision

> **Every minute matters in an emergency.**

EmergencySync aims to transform emergency response from:

```text
Emergency → Ambulance → Hospital → Specialist
```

into:

```text
Emergency
    ↓
AI-Assisted Analysis
    ↓
Ambulance Coordination
    ↓
Hospital Notification
    ↓
Specialist Preparation
    ↓
Patient Arrival
```

### Our goal is simple:

**Make the hospital ready before the patient arrives.**

---

# 👩‍💻 Team

### Team EmergencySync

- **Bhavana**
- **Sahana**
- **Jaishree**
- **Nesappriya**

Built with ❤️ for innovation in emergency healthcare coordination.

---

# 🔗 Project

**GitHub Repository**

`https://github.com/bhavana2007-glitch/EmergencySync`

---

## ⭐ Support the Project

If you find EmergencySync interesting:

⭐ Star the repository  
🍴 Fork the project  
🐛 Report issues  
💡 Suggest improvements  
🤝 Contribute to the project

---

# 🚑 EmergencySync

### **From Emergency Call to Hospital Readiness — Before Arrival.**
