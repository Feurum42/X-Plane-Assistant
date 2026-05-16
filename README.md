# X-Plane Assistant ✈️

**X-Plane Assistant** is a modern, high-performance desktop application designed to streamline your X-Plane 12 experience. It acts as a powerful companion for virtual pilots, managing everything from add-on installations to real-time community event tracking.

---

## 📥 Getting Started

The easiest way to use X-Plane Assistant is to download the latest Windows executable from our releases page.

[**🚀 Download Latest Release**](https://github.com/Feurum42/X-Plane-Assistant/releases/latest)

### Installation Options:
*   **Setup (Recommended):** `X-Plane-Assistant-Setup-x.x.x.exe` - Installs the app on your system and creates shortcuts.
*   **Portable:** `X-Plane-Assistant-Portable-x.x.x.exe` - Run it directly from anywhere without installation.

---

## 🌟 Key Features

- **Smart Mod Manager**: Automatically install, enable, or disable aircraft, plugins, and scenery.
- **Mod Vault Technology**: Safely store and manage your add-ons without cluttering your sim directory.
- **Unified Discovery Feed**: Aggregated news, reviews, and updates from sources like Threshold, FSElite, and simulationDaily.
- **Real-Time Event Tracking**: Never miss a VATSIM or IVAO event with our integrated schedule.
- **Geotagged Media Gallery**: Watch your flight screenshots pinned on an interactive map using real-time GPS data.
- **Accurate Author Detection**: Deep analysis of store metadata ensures every add-on is correctly attributed to its creator.

---

## 🚀 Getting Started

### Prerequisites

Make sure you have the following installed on your system:
- [Node.js](https://nodejs.org/) (v16.x or higher recommended)
- [npm](https://www.npmjs.com/) or [yarn](https://yarnpkg.com/)
- [Git](https://git-scm.com/)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Feurum42/X-Plane-Assistant.git
   cd X-Plane-Assistant
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Run the application in Development mode:**
   ```bash
   npm run dev
   ```

### Building for Production (Standalone EXE)

To create a professional installer (.exe) for Windows:
```bash
npm run build
```
Once completed, check the `dist-electron` folder. You will find:
- **X-Plane Assistant Setup.exe**: A full installer for your system.
- **X-Plane Assistant Portable.exe**: A version that runs without installation.

---

## 🛠️ Built With

- **Electron** - Cross-platform desktop framework
- **React** - UI Library
- **Vite** - Modern frontend build tool
- **Node.js** - Backend environment
- **Leaflet** - Interactive maps
- **Axios & Cheerio** - Web scraping and data aggregation

---

## 🤝 Contributing

Contributions are what make the open source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

## 👨‍💻 Author

**Feurum42** - [GitHub Profile](https://github.com/Feurum42)

---
*Developed with ❤️ for the X-Plane community.*
