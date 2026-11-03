# Dealflow Desk — Brokerage & Deal Screening App

A mobile-first, high-throughput deal screening and brokerage pipeline web app designed for internal sales scouts, brokers, and founders to triage 370+ business acquisition listings, uncover unrepresented seller opportunities, and broker transactions.

Built as a lightweight, zero-dependency static application ready to host immediately on **GitHub Pages**.

---

## ⚡ Live Features

1. **Mobile-First UX & Ergonomics**
   - **1-Thumb Triage Deck**: Rapid swipe or tap (`Pass` vs `Shortlist`) through unreviewed deals with full thumb ergonomics.
   - **Slide-Over & Bottom-Sheet Detail Inspector**: Deep-dive into seller notes, financial statements, and valuation multiples.
   - **1-Tap WhatsApp & Email Outreach**: Generates tailored seller inquiry scripts with pre-filled business details and revenue inquiry hooks.

2. **Equally Intuitive Desktop UX**
   - 3-column split view with collapsible screening sidebar, center deal feed, and synchronized right-side inspection drawer that never obscures the list.
   - Global keyboard shortcuts:
     - `S`: Shortlist active deal
     - `X`: Pass deal
     - `Space`: Inspect deal details
     - `/`: Focus search bar
     - `Esc`: Close detail drawer

3. **Proprietary Broker Opportunity Scoring (0–100)**
   Calculated dynamically per deal across 5 key dimensions:
   - **Seller Representation (25 pts)**: Highest score for direct-owner posts (FB Marketplace, Mudah.my, Carousell, Threads) where no broker is retained.
   - **Buyer CRM Matching (25 pts)**: Evaluates registered buyer mandates by sector, location, and budget.
   - **Fee Potential (25 pts)**: Scaled by transaction volume using standard Lehman/Modified Lehman formula ($10k minimum).
   - **Seller Urgency Signals (15 pts)**: Keyword detection for *Retiring*, *Relocating*, *Motivated*, *Seller Financing*, and *Absentee*.
   - **Financial Completeness & Multiples (10 pts)**: Rewards transparent revenue, SDE, and healthy profit multiples.

4. **Integrated Pipeline Kanban & CRM**
   - 5 active pipeline stages: `Shortlisted`, `Contacted`, `Mandate Signed`, `Buyer Matched`, and `Closed`.
   - Real-time **Pipeline Fee** KPI counter calculating total unweighted commission potential.
   - LocalStorage auto-persistence: Deal stage updates, assigned scouts (`Sarah`, `Alex`, `Founder`), and diligence notes persist automatically across sessions.
   - CSV export for reporting to Google Sheets or external CRMs.

5. **Multi-Currency FX Converter**
   - 1-tap live toggle between **USD** and **MYR** across all cards, statistics, and filters.
   - Automatically normalizes UK GBP, Euro, CAD, and AUD listings into standard comparable denominations.

---

## 📁 Repository Structure

```text
├── index.html              # Main application shell & markup
├── style.css               # Responsive design system (Mobile-first + Desktop 992px+)
├── app.js                  # State engine, Opportunity scoring, filters & event handlers
├── data/
│   └── listings.js         # 377 normalized deals extracted from Google Sheet
├── scripts/
│   ├── build_data.py       # Python ingestion script to sync from Google Sheets
│   └── capture_screens.js  # Automated headless Chrome screenshot verification suite
└── README.md
```

---

## 🚀 How to Host on GitHub Pages (2-Minute Setup)

1. **Push this repository to GitHub**:
   ```bash
   git init
   git add .
   git commit -m "Initial commit: Dealflow Desk static web application"
   git branch -M main
   git remote add origin https://github.com/<YOUR-USERNAME>/<YOUR-REPO-NAME>.git
   git push -u origin main
   ```

2. **Enable GitHub Pages**:
   - Go to your repository on GitHub.
   - Click **Settings** $\rightarrow$ **Pages** (under the "Code and automation" sidebar).
   - Under **Build and deployment** $\rightarrow$ **Branch**:
     - Select `main`
     - Select `/ (root)` folder
     - Click **Save**.

3. **Open your live URL**:
   Within ~60 seconds, your site will be live at:
   `https://<YOUR-USERNAME>.github.io/<YOUR-REPO-NAME>/`

---

## 🔄 Refreshing Data from Google Sheet

To update or re-fetch listings from the upstream Google Sheet:

```bash
python3 scripts/build_data.py
```

This pulls the latest rows, standardizes currencies and categories, and overwrites `data/listings.js`. Commit and push the file to deploy the update instantly!
