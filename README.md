# 🎯 Demo Competition Voting System

A real-time voting system for live demo competitions featuring progressive elimination animations, confetti celebrations, and seamless multi-round support.

## ✨ Features

- **📱 Mobile Voting** - QR code access for easy audience participation
- **🎬 Progressive Elimination** - Smooth animations as teams are eliminated
- **🎉 Confetti Celebration** - Spectacular winner announcements
- **🔄 Multi-Round Support** - Reset and start fresh rounds easily
- **📊 Real-Time Updates** - Instant vote synchronization across all devices
- **💾 Vote Tracking** - Complete history with timestamps
- **🎮 Admin Dashboard** - Full competition management interface
- **📺 Big Screen Display** - Perfect for projectors and large displays

## 🚀 Quick Start

### Prerequisites
- Node.js 16+ 
- npm

### Installation & Setup

1. **Install all dependencies:**
   ```bash
   npm run install-all
   ```

2. **Start the system:**
   ```bash
   npm run dev
   ```

3. **Access the interfaces:**
   - **Admin Dashboard**: http://localhost:3000/admin
   - **Main Display**: http://localhost:3000
   - **Mobile Voting**: Via QR code on main display

## 📋 How to Use

### Setting Up a Competition

1. **Open the Admin Dashboard** (`http://localhost:3000/admin`)
2. **Click "New Competition"**
3. **Enter competition name** (e.g., "Demo Day 2025")
4. **Add team names** (minimum 2, supports up to 10)
5. **Set expected participants** (helps with elimination timing)
6. **Click "Create Competition"**

### Running the Competition

1. **Open Main Display** on projector/big screen
2. **Start voting** from admin dashboard
3. **Audience scans QR code** to vote on mobile devices
4. **Watch real-time animations** as votes come in
5. **Teams are eliminated progressively** based on vote counts
6. **Winner announced with confetti!** 🎊

### Multi-Round Competitions

- **Reset competition** to start fresh round with same teams
- **Votes are preserved** for historical tracking
- **Teams reset** to active status for new voting
- **Perfect for tournament-style events**

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Admin Panel   │    │  Main Display   │    │ Mobile Voting   │
│  (Management)   │    │  (Big Screen)   │    │  (QR Access)    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    WebSocket Connections
                                 │
                 ┌─────────────────────────┐
                 │      Node.js Server     │
                 │   (Express + Socket.io) │
                 └─────────────────────────┘
                                 │
                        ┌─────────────────┐
                        │  SQLite Database │
                        │   (Persistent)   │
                        └─────────────────┘
```

### Technology Stack
- **Frontend**: React 18 with Socket.io client
- **Backend**: Node.js with Express and Socket.io
- **Database**: SQLite for data persistence
- **Real-time**: WebSocket connections for instant updates
- **Animations**: CSS transitions and confetti.js
- **Mobile**: Responsive design optimized for touch devices

## 🎨 Key Components

### Main Display (`/`)
- **Team grid** with elimination animations
- **QR code** for mobile voting access
- **Real-time vote updates** (optional display)
- **Winner celebration** with confetti
- **Responsive design** for various screen sizes

### Mobile Voting (`/vote`)
- **Touch-friendly interface** optimized for phones
- **One vote per device** protection
- **Real-time feedback** on vote submission
- **Progressive design** with smooth animations
- **Session management** for multi-round support

### Admin Dashboard (`/admin`)
- **Competition creation** and management
- **Team setup** with drag-and-drop support
- **Real-time monitoring** of vote counts
- **Competition history** and results tracking
- **Quick reset** for new rounds

## 🔧 Configuration Options

### Elimination Logic
- **Minimum votes required** before elimination starts
- **Automatic elimination** of lowest-voted team
- **Tie prevention** - no elimination if teams are tied
- **Final round protection** - stops at 2 teams

### Customization
- **Team count**: 2-10 teams supported
- **Color schemes**: Customizable in CSS
- **Animation timing**: Adjustable in components
- **Vote thresholds**: Configurable per competition

## 🎯 Perfect For

- **Demo Days** and pitch competitions
- **Hackathons** and coding contests
- **Talent shows** and performance events
- **Product launches** with audience engagement
- **Team building** activities
- **Educational** voting exercises

## 🛠️ Development

### Project Structure
```
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── utils/         # Utilities (socket manager)
│   │   └── App.js         # Main app component
│   └── public/
│       ├── index.html     # Main HTML
│       └── confetti.js    # Confetti animation library
├── server/                # Node.js backend
│   ├── app.js            # Main server file
│   ├── database.js       # SQLite database manager
│   └── package.json      # Server dependencies
└── package.json          # Root package with scripts
```

### Scripts
- `npm run dev` - Start both server and client
- `npm run server` - Start only the server
- `npm run client` - Start only the client
- `npm run install-all` - Install all dependencies

## 🔐 Security Features

- **Session-based voting** prevents duplicate votes
- **IP address tracking** for audit trails
- **Input validation** on all endpoints
- **CORS protection** for API security
- **SQL injection prevention** with parameterized queries

## 📱 Mobile Optimization

- **Responsive design** works on all screen sizes
- **Touch-friendly buttons** with haptic feedback
- **Fast loading** optimized for mobile networks
- **Progressive Web App** capabilities
- **Offline resilience** with graceful degradation

## 🎊 Ready to Vote!

Your live demo competition voting system is now complete and ready to create an engaging, interactive experience for your audience. The combination of real-time voting, beautiful animations, and seamless multi-round support will make your event memorable and fun for everyone involved!
