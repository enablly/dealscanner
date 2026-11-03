/**
 * DEALFLOW DEAL DESK — APPLICATION CONTROLLER
 * Full client-side broker CRM, triage engine, and opportunity scorer.
 * Works out-of-the-box on GitHub Pages & local files without external servers.
 */

// Simulated Pre-vetted Registered Buyers in CRM
const BUYERS_CRM = [
  {
    id: "B-101",
    name: "Apex Retail Partners (PE / Family Office)",
    contact: "Marcus Tan",
    email: "marcus@apexpartners.my",
    phone: "+60 12-384 9912",
    focus: ["F&B", "Retail"],
    region: ["Malaysia", "Singapore"],
    budgetUsd: 1500000,
    criteria: "Turnkey kopitiam chains, F&B concepts, or cashflow retail in Klang Valley < RM 5M."
  },
  {
    id: "B-102",
    name: "Horizon Health Holdings",
    contact: "Dr. Evelyn Ross",
    email: "evelyn@horizonhealth.us",
    phone: "+1 (305) 555-0192",
    focus: ["Healthcare", "Beauty & Personal"],
    region: ["United States"],
    budgetUsd: 5000000,
    criteria: "Audiology, dental, chiro, medical clinics in Florida & Texas with >$200K profit."
  },
  {
    id: "B-103",
    name: "Klang Valley Syndicate",
    contact: "Dato' Brian Wong",
    email: "brian@kvs.com.my",
    phone: "+60 16-221 0081",
    focus: ["F&B", "Logistics & Distribution", "Auto"],
    region: ["Malaysia"],
    budgetUsd: 400000,
    criteria: "Direct owner takeovers, high foot-traffic restaurants in KL/Selangor < RM 1M."
  },
  {
    id: "B-104",
    name: "SaaS & Digital Operators LLC",
    contact: "Alex Rivera",
    email: "alex@digitalops.io",
    phone: "+1 (415) 555-8831",
    focus: ["SaaS & Digital", "E-commerce"],
    region: ["Online", "United States"],
    budgetUsd: 800000,
    criteria: "Content sites, Shopify stores, Micro-SaaS with clean historical analytics."
  },
  {
    id: "B-105",
    name: "Heritage Trades Group",
    contact: "Sam Jenkins",
    email: "sam@heritagetrades.com",
    phone: "+1 (713) 555-4421",
    focus: ["Home & Field Services", "Construction & Trades"],
    region: ["United States"],
    budgetUsd: 2000000,
    criteria: "Cleaning, HVAC, roofing, dryer vents with retiring owners & strong local crew."
  }
];

class DealDeskApp {
  constructor() {
    this.listings = window.DEALFLOW_LISTINGS || [];
    this.meta = window.DEALFLOW_META || {};
    this.buyers = BUYERS_CRM;

    // Load saved deal states (stages, notes, assignee) from localStorage
    this.storageKey = "dealflow_desk_state_v1";
    this.dealStates = this.loadState();

    // Default Filters State
    this.filters = {
      search: "",
      viewPreset: "all",
      rep: ["owner", "broker", "unknown"],
      countries: [], // empty = all
      industries: [], // empty = all
      feeTier: "any",
      signals: [],
      profitOnly: false,
      hideDuplicates: true,
      sortBy: "opp-desc"
    };

    this.activeTab = "inbox";
    this.currentCurrency = "USD";
    this.selectedDealId = null;
    this.triageIndex = 0;
    this.filteredDeals = [];

    this.init();
  }

  loadState() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (raw) return JSON.parse(raw);
      
      // Default initial pipeline seed for a rich first-run experience
      const initialSeed = {
        2: { stage: "shortlisted", assignee: "Sarah", notes: "Direct owner, high-urgency retirement in Oregon. Perfect match for BlueStar.", updatedAt: new Date().toISOString() },
        3: { stage: "contacted", assignee: "Alex", notes: "Emailed broker for CIM & 3-year tax returns.", updatedAt: new Date().toISOString() },
        5: { stage: "mandate", assignee: "Founder (Direct)", notes: "Exclusivity signed for 60 days. Preparing confidential teaser.", updatedAt: new Date().toISOString() },
        8: { stage: "matched", assignee: "Sarah", notes: "Sent blind profile to Apex Retail Partners. Awaiting feedback.", updatedAt: new Date().toISOString() }
      };
      localStorage.setItem(this.storageKey, JSON.stringify(initialSeed));
      return initialSeed;
    } catch (e) {
      console.warn("Storage not available, using in-memory state", e);
      return {};
    }
  }

  saveState() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.dealStates));
    } catch (e) {
      console.warn("Failed to persist state", e);
    }
  }

  getDealState(dealId) {
    return this.dealStates[dealId] || {
      stage: "unscreened", // unscreened | shortlisted | contacted | mandate | matched | closed | passed
      assignee: "Unassigned",
      notes: "",
      updatedAt: null
    };
  }

  updateDealState(dealId, patch) {
    const prev = this.getDealState(dealId);
    this.dealStates[dealId] = {
      ...prev,
      ...patch,
      updatedAt: new Date().toISOString()
    };
    this.saveState();
    this.renderKPIs();
    this.renderCurrentView();
  }

  init() {
    this.calculateOpportunityScores();
    this.populateSidebarFilters();
    this.setupEventListeners();
    this.applyFilters();
    this.renderKPIs();
  }

  calculateOpportunityScores() {
    this.listings.forEach(deal => {
      let score = 0;
      const breakdown = {};

      // 1. Unrepresented Seller (max 25)
      let repScore = 12;
      if (deal.rep === "owner") repScore = 25;
      else if (deal.rep === "broker") repScore = 6;
      breakdown.rep = repScore;
      score += repScore;

      // 2. Buyer demand matching in CRM (max 25)
      const matchedBuyers = this.getMatchingBuyers(deal);
      deal.matchedBuyers = matchedBuyers;
      let buyerScore = 5;
      if (matchedBuyers.length >= 4) buyerScore = 25;
      else if (matchedBuyers.length >= 2) buyerScore = 20;
      else if (matchedBuyers.length === 1) buyerScore = 14;
      breakdown.buyers = buyerScore;
      score += buyerScore;

      // 3. Fee Potential (max 25)
      const feeUsd = this.estimateFeeUsd(deal.askUsd);
      deal.estFeeUsd = feeUsd;
      let feeScore = 8;
      if (feeUsd >= 50000) feeScore = 25;
      else if (feeUsd >= 20000) feeScore = 20;
      else if (feeUsd >= 10000) feeScore = 15;
      breakdown.fee = feeScore;
      score += feeScore;

      // 4. Seller Motivation (max 15)
      let motScore = 4;
      if (deal.signals.includes("Retiring") || deal.signals.includes("Relocating")) motScore += 8;
      if (deal.signals.includes("Motivated") || deal.signals.includes("Seller financing")) motScore += 3;
      motScore = Math.min(motScore, 15);
      breakdown.motivation = motScore;
      score += motScore;

      // 5. Data completeness & reasonable multiple (max 10)
      let dataScore = 3;
      if (deal.profitUsd) dataScore += 4;
      if (deal.revUsd) dataScore += 2;
      if (deal.mult && deal.mult > 0 && deal.mult < 8) dataScore += 1;
      breakdown.data = Math.min(dataScore, 10);
      score += breakdown.data;

      deal.oppScore = Math.min(Math.round(score), 99);
      deal.scoreBreakdown = breakdown;
    });
  }

  estimateFeeUsd(askUsd) {
    if (!askUsd || askUsd <= 0) return 10000;
    if (askUsd < 1000000) {
      return Math.max(Math.round(askUsd * 0.10), 10000);
    } else if (askUsd < 5000000) {
      return Math.round(100000 + (askUsd - 1000000) * 0.06);
    } else {
      return Math.round(340000 + (askUsd - 5000000) * 0.04);
    }
  }

  getMatchingBuyers(deal) {
    return this.buyers.filter(buyer => {
      const matchInd = buyer.focus.includes(deal.industry) || buyer.focus.includes("All");
      const matchReg = buyer.region.includes(deal.country) || buyer.region.includes("Global") ||
                       (deal.country === "Online" && buyer.region.includes("Online"));
      const matchBudget = !deal.askUsd || deal.askUsd <= buyer.budgetUsd * 1.25;
      return matchInd && matchReg && matchBudget;
    });
  }

  populateSidebarFilters() {
    const countryCounts = {};
    const industryCounts = {};

    this.listings.forEach(d => {
      countryCounts[d.country] = (countryCounts[d.country] || 0) + 1;
      industryCounts[d.industry] = (industryCounts[d.industry] || 0) + 1;
    });

    const countryContainer = document.getElementById("country-filters");
    if (countryContainer) {
      const sortedCountries = Object.entries(countryCounts).sort((a, b) => b[1] - a[1]);
      countryContainer.innerHTML = sortedCountries.map(([c, n]) => `
        <label class="check-item">
          <input type="checkbox" name="country" value="${c}">
          <span>${c} (${n})</span>
        </label>
      `).join("");
    }

    const industryContainer = document.getElementById("industry-filters");
    if (industryContainer) {
      const sortedIndustries = Object.entries(industryCounts).sort((a, b) => b[1] - a[1]);
      industryContainer.innerHTML = sortedIndustries.map(([ind, n]) => `
        <label class="check-item">
          <input type="checkbox" name="industry" value="${ind}">
          <span>${ind} (${n})</span>
        </label>
      `).join("");
    }
  }

  setupEventListeners() {
    // Top bar Tab Nav
    document.querySelectorAll(".nav-tab, .m-nav-item").forEach(btn => {
      btn.addEventListener("click", () => {
        const tab = btn.dataset.tab;
        this.switchTab(tab);
      });
    });

    // Preset Chip Buttons
    document.getElementById("chips-strip")?.addEventListener("click", (e) => {
      const chip = e.target.closest(".chip");
      if (!chip || chip.id === "btn-toggle-filters") return;
      document.querySelectorAll(".chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      this.filters.viewPreset = chip.dataset.view;
      this.applyFilters();
    });

    // Mobile / Desktop search
    const handleSearch = (e) => {
      this.filters.search = e.target.value.toLowerCase().trim();
      this.applyFilters();
    };
    document.getElementById("desktop-search")?.addEventListener("input", handleSearch);
    document.getElementById("mobile-search")?.addEventListener("input", handleSearch);

    // Keyboard shortcut '/' to search & triage
    window.addEventListener("keydown", (e) => {
      if (e.key === "/" && document.activeElement.tagName !== "INPUT" && document.activeElement.tagName !== "TEXTAREA") {
        e.preventDefault();
        const searchInput = window.innerWidth >= 992 ? document.getElementById("desktop-search") : document.getElementById("mobile-search");
        searchInput?.focus();
      }
      if (document.activeElement.tagName !== "INPUT" && document.activeElement.tagName !== "TEXTAREA") {
        if (e.key === "s" || e.key === "S") {
          e.preventDefault();
          this.quickShortlistCurrent();
        } else if (e.key === "x" || e.key === "X") {
          e.preventDefault();
          this.quickPassCurrent();
        } else if (e.key === "Escape") {
          this.closeDrawer();
        }
      }
    });

    // Currency Switcher
    document.getElementById("currency-toggle")?.addEventListener("click", (e) => {
      const btn = e.target.closest(".cur-btn");
      if (!btn) return;
      document.querySelectorAll(".cur-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      this.currentCurrency = btn.dataset.cur;
      this.renderCurrentView();
      if (this.selectedDealId !== null) {
        this.renderDrawer(this.selectedDealId);
      }
    });

    // Sort select
    document.getElementById("sort-by")?.addEventListener("change", (e) => {
      this.filters.sortBy = e.target.value;
      this.applyFilters();
    });

    // Sidebar filter toggles
    document.getElementById("sidebar-filters")?.addEventListener("change", () => {
      this.readSidebarFilters();
      this.applyFilters();
    });

    // Signal toggles in sidebar
    document.getElementById("signal-filters")?.addEventListener("click", (e) => {
      const tag = e.target.closest(".tag-toggle");
      if (!tag) return;
      tag.classList.toggle("active");
      this.readSidebarFilters();
      this.applyFilters();
    });

    // Fee Tier control
    document.getElementById("fee-tier-filter")?.addEventListener("click", (e) => {
      const btn = e.target.closest(".seg-btn");
      if (!btn) return;
      document.querySelectorAll("#fee-tier-filter .seg-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      this.filters.feeTier = btn.dataset.fee;
      this.applyFilters();
    });

    // Reset filters
    document.getElementById("btn-reset-filters")?.addEventListener("click", () => this.resetFilters());
    document.getElementById("btn-empty-reset")?.addEventListener("click", () => this.resetFilters());

    // Drawer close
    document.getElementById("btn-close-drawer")?.addEventListener("click", () => this.closeDrawer());

    // Drawer Stage & Assignee selectors
    document.getElementById("drawer-stage")?.addEventListener("change", (e) => {
      if (this.selectedDealId !== null) {
        this.updateDealState(this.selectedDealId, { stage: e.target.value });
        this.showToast(`Deal updated to: ${e.target.value}`);
      }
    });

    document.getElementById("drawer-assignee")?.addEventListener("change", (e) => {
      if (this.selectedDealId !== null) {
        this.updateDealState(this.selectedDealId, { assignee: e.target.value });
        this.showToast(`Assigned to ${e.target.value}`);
      }
    });

    // Drawer Shortlist / Pass buttons
    document.getElementById("btn-drawer-shortlist")?.addEventListener("click", () => {
      if (this.selectedDealId !== null) {
        this.updateDealState(this.selectedDealId, { stage: "shortlisted" });
        this.showToast("✓ Deal Shortlisted & added to pipeline");
        this.renderDrawer(this.selectedDealId);
      }
    });

    document.getElementById("btn-drawer-pass")?.addEventListener("click", () => {
      if (this.selectedDealId !== null) {
        this.updateDealState(this.selectedDealId, { stage: "passed" });
        this.showToast("✕ Deal marked as Passed");
        this.renderDrawer(this.selectedDealId);
      }
    });

    // Drawer Notes auto-save
    const notesInput = document.getElementById("drawer-notes");
    let noteTimeout = null;
    notesInput?.addEventListener("input", () => {
      clearTimeout(noteTimeout);
      const status = document.getElementById("drawer-notes-status");
      if (status) status.textContent = "Typing...";
      noteTimeout = setTimeout(() => {
        if (this.selectedDealId !== null) {
          this.updateDealState(this.selectedDealId, { notes: notesInput.value });
          if (status) status.textContent = "Saved to local storage ✓";
        }
      }, 500);
    });

    // 1-Tap Copy Pitch
    document.getElementById("btn-copy-pitch")?.addEventListener("click", () => {
      const pitch = document.getElementById("drawer-pitch-text")?.value;
      if (pitch) {
        navigator.clipboard?.writeText(pitch);
        this.showToast("📋 Pitch copied to clipboard!");
      }
    });

    // WhatsApp outreach
    document.getElementById("btn-outreach-wa")?.addEventListener("click", () => {
      const pitch = document.getElementById("drawer-pitch-text")?.value;
      const url = `https://wa.me/?text=${encodeURIComponent(pitch || "")}`;
      window.open(url, "_blank");
    });

    // Triage Mode button listeners
    document.getElementById("btn-triage-pass")?.addEventListener("click", () => this.triageAction("passed"));
    document.getElementById("btn-triage-shortlist")?.addEventListener("click", () => this.triageAction("shortlisted"));
    document.getElementById("btn-triage-details")?.addEventListener("click", () => {
      const deal = this.filteredDeals[this.triageIndex];
      if (deal) this.openDrawer(deal.id);
    });

    // CSV Export
    document.getElementById("btn-export-csv")?.addEventListener("click", () => this.exportCSV());
  }

  readSidebarFilters() {
    const repCheckboxes = document.querySelectorAll('input[name="rep"]:checked');
    this.filters.rep = Array.from(repCheckboxes).map(cb => cb.value);

    const countryCheckboxes = document.querySelectorAll('input[name="country"]:checked');
    this.filters.countries = Array.from(countryCheckboxes).map(cb => cb.value);

    const indCheckboxes = document.querySelectorAll('input[name="industry"]:checked');
    this.filters.industries = Array.from(indCheckboxes).map(cb => cb.value);

    const activeSignals = document.querySelectorAll('#signal-filters .tag-toggle.active');
    this.filters.signals = Array.from(activeSignals).map(t => t.dataset.sig);

    this.filters.profitOnly = !!document.getElementById("toggle-profit-only")?.checked;
    this.filters.hideDuplicates = !!document.getElementById("toggle-hide-dups")?.checked;
  }

  resetFilters() {
    this.filters = {
      search: "",
      viewPreset: "all",
      rep: ["owner", "broker", "unknown"],
      countries: [],
      industries: [],
      feeTier: "any",
      signals: [],
      profitOnly: false,
      hideDuplicates: true,
      sortBy: "opp-desc"
    };

    document.querySelectorAll('input[name="rep"]').forEach(cb => cb.checked = true);
    document.querySelectorAll('input[name="country"]').forEach(cb => cb.checked = false);
    document.querySelectorAll('input[name="industry"]').forEach(cb => cb.checked = false);
    document.querySelectorAll('#signal-filters .tag-toggle').forEach(t => t.classList.remove("active"));
    document.querySelectorAll('#fee-tier-filter .seg-btn').forEach(b => b.classList.toggle("active", b.dataset.fee === "any"));
    document.querySelectorAll('.chip').forEach(c => c.classList.toggle("active", c.dataset.view === "all"));
    
    const profitToggle = document.getElementById("toggle-profit-only");
    if (profitToggle) profitToggle.checked = false;
    const dupToggle = document.getElementById("toggle-hide-dups");
    if (dupToggle) dupToggle.checked = true;

    const deskSearch = document.getElementById("desktop-search");
    if (deskSearch) deskSearch.value = "";
    const mobSearch = document.getElementById("mobile-search");
    if (mobSearch) mobSearch.value = "";

    this.applyFilters();
  }

  applyFilters() {
    let list = this.listings;

    // View presets
    if (this.filters.viewPreset === "owner") {
      list = list.filter(d => d.rep === "owner");
    } else if (this.filters.viewPreset === "malaysia") {
      list = list.filter(d => d.country === "Malaysia");
    } else if (this.filters.viewPreset === "us") {
      list = list.filter(d => d.country === "United States");
    } else if (this.filters.viewPreset === "high-fee") {
      list = list.filter(d => d.estFeeUsd >= 20000);
    } else if (this.filters.viewPreset === "motivated") {
      list = list.filter(d => d.signals.some(s => ["Retiring", "Relocating", "Motivated"].includes(s)));
    } else if (this.filters.viewPreset === "missing-pl") {
      list = list.filter(d => !d.profitUsd);
    }

    // Representation
    if (this.filters.rep.length > 0 && this.filters.rep.length < 3) {
      list = list.filter(d => this.filters.rep.includes(d.rep));
    }

    // Country
    if (this.filters.countries.length > 0) {
      list = list.filter(d => this.filters.countries.includes(d.country));
    }

    // Industry
    if (this.filters.industries.length > 0) {
      list = list.filter(d => this.filters.industries.includes(d.industry));
    }

    // Signals
    if (this.filters.signals.length > 0) {
      list = list.filter(d => this.filters.signals.some(s => d.signals.includes(s)));
    }

    // Fee Tier
    if (this.filters.feeTier === "10k") list = list.filter(d => d.estFeeUsd >= 10000);
    else if (this.filters.feeTier === "25k") list = list.filter(d => d.estFeeUsd >= 25000);
    else if (this.filters.feeTier === "100k") list = list.filter(d => d.estFeeUsd >= 100000);

    // Data completeness
    if (this.filters.profitOnly) {
      list = list.filter(d => d.profitUsd && d.profitUsd > 0);
    }

    // Duplicates
    if (this.filters.hideDuplicates) {
      list = list.filter(d => d.dupOf === null || d.dupOf === undefined);
    }

    // Search query
    if (this.filters.search) {
      const q = this.filters.search;
      list = list.filter(d => {
        return (d.name && d.name.toLowerCase().includes(q)) ||
               (d.loc && d.loc.toLowerCase().includes(q)) ||
               (d.genre && d.genre.toLowerCase().includes(q)) ||
               (d.industry && d.industry.toLowerCase().includes(q)) ||
               (d.blurb && d.blurb.toLowerCase().includes(q)) ||
               (d.source && d.source.toLowerCase().includes(q));
      });
    }

    // Sort
    list = [...list].sort((a, b) => {
      switch (this.filters.sortBy) {
        case "opp-desc": return b.oppScore - a.oppScore;
        case "fee-desc": return (b.estFeeUsd || 0) - (a.estFeeUsd || 0);
        case "ask-desc": return (b.askUsd || 0) - (a.askUsd || 0);
        case "ask-asc": return (a.askUsd || 0) - (b.askUsd || 0);
        case "mult-asc": {
          const ma = a.mult && a.mult > 0 ? a.mult : 999;
          const mb = b.mult && b.mult > 0 ? b.mult : 999;
          return ma - mb;
        }
        case "date-desc": return (b.listed || "").localeCompare(a.listed || "");
        default: return b.oppScore - a.oppScore;
      }
    });

    this.filteredDeals = list;
    this.triageIndex = 0;
    this.renderCurrentView();
  }

  renderCurrentView() {
    this.renderPresetCounts();
    if (this.activeTab === "inbox") {
      this.renderInboxList();
    } else if (this.activeTab === "triage") {
      this.renderTriageCard();
    } else if (this.activeTab === "pipeline") {
      this.renderPipelineKanban();
    } else if (this.activeTab === "buyers") {
      this.renderBuyersDirectory();
    }
  }

  renderPresetCounts() {
    const elAll = document.getElementById("chip-all-count");
    if (elAll) elAll.textContent = this.listings.length;
    const elOwner = document.getElementById("chip-owner-count");
    if (elOwner) elOwner.textContent = this.listings.filter(d => d.rep === "owner").length;
    const elMy = document.getElementById("chip-my-count");
    if (elMy) elMy.textContent = this.listings.filter(d => d.country === "Malaysia").length;
    const elUs = document.getElementById("chip-us-count");
    if (elUs) elUs.textContent = this.listings.filter(d => d.country === "United States").length;
  }

  renderKPIs() {
    let toScreen = 0;
    let shortlisted = 0;
    let contacted = 0;
    let mandates = 0;
    let closed = 0;
    let pipelineFee = 0;

    this.listings.forEach(d => {
      const state = this.getDealState(d.id);
      if (state.stage === "unscreened" || !state.stage) toScreen++;
      else if (state.stage === "shortlisted") {
        shortlisted++;
        pipelineFee += d.estFeeUsd || 10000;
      } else if (state.stage === "contacted") {
        contacted++;
        pipelineFee += d.estFeeUsd || 10000;
      } else if (state.stage === "mandate") {
        mandates++;
        pipelineFee += d.estFeeUsd || 10000;
      } else if (state.stage === "matched") {
        pipelineFee += d.estFeeUsd || 10000;
      } else if (state.stage === "closed") {
        closed++;
      }
    });

    const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    setVal("kpi-to-screen", toScreen);
    setVal("inbox-count", toScreen);
    setVal("m-badge-inbox", toScreen);
    setVal("kpi-shortlisted", shortlisted);
    setVal("kpi-contacted", contacted);
    setVal("kpi-mandates", mandates);
    setVal("kpi-closed", closed);
    setVal("pipeline-count", shortlisted + contacted + mandates);
    setVal("kpi-pipeline-fee", this.formatCurrencyUsd(pipelineFee));
  }

  renderInboxList() {
    const container = document.getElementById("deal-list");
    const emptyState = document.getElementById("empty-state");
    const countEl = document.getElementById("showing-count");

    if (countEl) countEl.textContent = `Showing ${this.filteredDeals.length} of ${this.listings.length}`;

    if (!container) return;

    if (this.filteredDeals.length === 0) {
      container.innerHTML = "";
      emptyState?.classList.remove("hidden");
      return;
    }
    emptyState?.classList.add("hidden");

    container.innerHTML = this.filteredDeals.map(deal => {
      const state = this.getDealState(deal.id);
      const isSelected = this.selectedDealId === deal.id;
      const isPassed = state.stage === "passed";

      const scoreColor = deal.oppScore >= 80 ? "g" : deal.oppScore >= 65 ? "a" : "r";
      const repBadge = deal.rep === "owner" 
        ? `<span class="tag own">Owner Direct</span>`
        : deal.rep === "broker" 
        ? `<span class="tag brk">Broker</span>` 
        : ``;

      const signalTags = deal.signals.map(s => `<span class="tag warn">${s}</span>`).join("");

      const askText = this.formatPrice(deal.ask, deal.cur, deal.askUsd);
      const profitText = deal.profitUsd ? this.formatPrice(deal.profit, deal.cur, deal.profitUsd) : `<span style="color:var(--text-light)">—</span>`;
      const multText = deal.mult && deal.mult > 0 ? `${deal.mult.toFixed(1)}×` : `<span style="color:var(--text-light)">N/A</span>`;
      const feeText = this.formatCurrencyUsd(deal.estFeeUsd);

      return `
        <div class="SwipeReveal" data-id="${deal.id}">
          <div class="SwipeReveal-content ${isSelected ? "selected" : ""} ${isPassed ? "opacity-50" : ""}" data-deal-click="${deal.id}">
            <div class="card-top">
              <div class="score-badge ${scoreColor}">
                ⚡ ${deal.oppScore} <span style="font-size:10.5px;font-weight:600">${deal.oppScore >= 80 ? "Pursue" : deal.oppScore >= 65 ? "Review" : "Low"}</span>
              </div>
              <div class="fee-tag">
                <div class="val text-green">${feeText}</div>
                <div class="sub">Est. Fee</div>
              </div>
            </div>

            <div>
              <div class="deal-title">${this.escapeHTML(deal.name)}</div>
              <div class="deal-loc">
                <span>📍 ${this.escapeHTML(deal.loc || deal.country)}</span>
                <span>•</span>
                <span>${this.escapeHTML(deal.source)}</span>
                ${state.stage !== "unscreened" ? `<span class="badge">${state.stage}</span>` : ""}
              </div>
            </div>

            <div class="pill-row">
              ${repBadge}
              <span class="tag fnb">${deal.industry}</span>
              ${signalTags}
              ${!deal.profitUsd ? `<span class="tag warn">Needs P&amp;L</span>` : ""}
            </div>

            <div class="metrics-grid">
              <div class="metric-item">
                <span class="lbl">Asking</span>
                <span class="num">${askText}</span>
              </div>
              <div class="metric-item">
                <span class="lbl">Profit</span>
                <span class="num">${profitText}</span>
              </div>
              <div class="metric-item">
                <span class="lbl">Multiple</span>
                <span class="num">${multText}</span>
              </div>
            </div>

            <div class="card-footer">
              <div class="buyer-match-btn">🎯 ${deal.matchedBuyers.length} Matched Buyers</div>
              <div class="quick-acts">
                <button class="icon-btn red" title="Pass" data-action="pass" data-id="${deal.id}">✕</button>
                <button class="icon-btn green" title="Shortlist" data-action="shortlist" data-id="${deal.id}">✓</button>
              </div>
            </div>
          </div>

          <div class="SwipeReveal-panel">
            <button class="swipe-btn pass" data-action="pass" data-id="${deal.id}">✕<br>Pass</button>
            <button class="swipe-btn assign" data-action="open" data-id="${deal.id}">📋<br>Details</button>
            <button class="swipe-btn shortlist" data-action="shortlist" data-id="${deal.id}">✓<br>Shortlist</button>
          </div>
        </div>
      `;
    }).join("");

    // Bind card click & action events
    container.querySelectorAll("[data-deal-click]").forEach(card => {
      card.addEventListener("click", (e) => {
        if (e.target.closest(".icon-btn")) return;
        const dealId = parseInt(card.dataset.dealClick, 10);
        this.openDrawer(dealId);
      });
    });

    container.querySelectorAll("[data-action]").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        const dealId = parseInt(btn.dataset.id, 10);
        if (action === "pass") {
          this.updateDealState(dealId, { stage: "passed" });
          this.showToast("✕ Deal passed");
        } else if (action === "shortlist") {
          this.updateDealState(dealId, { stage: "shortlisted" });
          this.showToast("✓ Shortlisted & added to pipeline");
        } else if (action === "open") {
          this.openDrawer(dealId);
        }
      });
    });
  }

  openDrawer(dealId) {
    this.selectedDealId = dealId;
    const deal = this.listings.find(d => d.id === dealId);
    if (!deal) return;

    document.querySelectorAll(".SwipeReveal-content").forEach(el => {
      el.classList.toggle("selected", el.dataset.dealClick == dealId);
    });

    this.renderDrawer(dealId);

    const drawer = document.getElementById("detail-drawer");
    if (drawer) drawer.classList.add("open");
  }

  closeDrawer() {
    const drawer = document.getElementById("detail-drawer");
    if (drawer) drawer.classList.remove("open");
    this.selectedDealId = null;
    document.querySelectorAll(".SwipeReveal-content").forEach(el => el.classList.remove("selected"));
  }

  renderDrawer(dealId) {
    const deal = this.listings.find(d => d.id === dealId);
    if (!deal) return;
    const state = this.getDealState(dealId);

    const setText = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };

    setText("drawer-source-badge", deal.source);
    setText("drawer-scandate", `Scanned ${deal.scan || deal.listed}`);
    setText("drawer-title", deal.name);
    setText("drawer-loc", `📍 ${deal.loc || deal.country} • ${deal.genre || deal.industry}`);
    setText("drawer-score-val", deal.oppScore);

    // Score breakdown bars
    const scoreBars = document.getElementById("drawer-score-bars");
    if (scoreBars) {
      const b = deal.scoreBreakdown || {};
      scoreBars.innerHTML = `
        <div class="score-bar-row">
          <span>Unrepresented Seller</span>
          <div class="bar-track"><div class="bar-fill" style="width:${(b.rep/25)*100}%"></div></div>
          <b>${b.rep}/25</b>
        </div>
        <div class="score-bar-row">
          <span>Buyer CRM Demand</span>
          <div class="bar-track"><div class="bar-fill" style="width:${(b.buyers/25)*100}%"></div></div>
          <b>${b.buyers}/25</b>
        </div>
        <div class="score-bar-row">
          <span>Fee Potential</span>
          <div class="bar-track"><div class="bar-fill" style="width:${(b.fee/25)*100}%"></div></div>
          <b>${b.fee}/25</b>
        </div>
        <div class="score-bar-row">
          <span>Seller Motivation</span>
          <div class="bar-track"><div class="bar-fill" style="width:${(b.motivation/15)*100}%"></div></div>
          <b>${b.motivation}/15</b>
        </div>
        <div class="score-bar-row">
          <span>Data Completeness</span>
          <div class="bar-track"><div class="bar-fill" style="width:${(b.data/10)*100}%"></div></div>
          <b>${b.data}/10</b>
        </div>
      `;
    }

    // Pills
    const pills = document.getElementById("drawer-pills");
    if (pills) {
      const repBadge = deal.rep === "owner" 
        ? `<span class="tag own">Direct Owner Post</span>`
        : `<span class="tag brk">Broker Represented</span>`;
      pills.innerHTML = `
        ${repBadge}
        <span class="tag fnb">${deal.industry}</span>
        ${deal.signals.map(s => `<span class="tag warn">${s}</span>`).join("")}
        ${!deal.profitUsd ? `<span class="tag warn">Needs P&amp;L</span>` : ""}
      `;
    }

    // Financials
    setText("drawer-ask-nat", deal.ask ? `${deal.cur} ${Number(deal.ask).toLocaleString()}` : "Price on request");
    setText("drawer-ask-usd", deal.askUsd ? `$${Number(deal.askUsd).toLocaleString()} USD` : "Unknown");
    
    setText("drawer-profit-nat", deal.profit ? `${deal.cur} ${Number(deal.profit).toLocaleString()}` : "Not Disclosed");
    setText("drawer-profit-usd", deal.profitUsd ? `$${Number(deal.profitUsd).toLocaleString()} USD` : "Request P&L from seller");

    setText("drawer-mult", deal.mult && deal.mult > 0 ? `${deal.mult.toFixed(2)}×` : "—");
    setText("drawer-mult-sub", deal.mult && deal.mult > 0 ? (deal.mult < 3 ? "Below industry avg" : "At market") : "Needs Profit figure");

    setText("drawer-fee", this.formatCurrencyUsd(deal.estFeeUsd));

    // Blurb
    const blurbEl = document.getElementById("drawer-blurb");
    if (blurbEl) blurbEl.textContent = deal.blurb || "No seller blurb provided in initial listing.";

    // Original Link
    const linkEl = document.getElementById("drawer-original-link");
    if (linkEl) {
      if (deal.link) {
        linkEl.href = deal.link;
        linkEl.style.display = "inline-block";
      } else {
        linkEl.style.display = "none";
      }
    }

    // Matched Buyers list
    const buyersContainer = document.getElementById("drawer-matched-buyers");
    setText("drawer-buyer-count", deal.matchedBuyers.length);
    if (buyersContainer) {
      if (deal.matchedBuyers.length === 0) {
        buyersContainer.innerHTML = `<p style="font-size:12px;color:var(--text-muted)">No buyers with exact criteria currently registered.</p>`;
      } else {
        buyersContainer.innerHTML = deal.matchedBuyers.map(b => `
          <div style="background:var(--bg-canvas);border:1px solid var(--border);border-radius:8px;padding:8px 10px;margin-bottom:6px;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <b style="font-size:12px;color:var(--text-main)">${b.name}</b>
              <span style="font-size:11px;color:var(--green-dark);font-weight:700">Budget: $${(b.budgetUsd/1000).toLocaleString()}K</span>
            </div>
            <div style="font-size:11.5px;color:var(--text-muted);margin-top:2px">${b.criteria}</div>
          </div>
        `).join("");
      }
    }

    // Dynamic 1-Tap Broker Pitch
    const pitchTextEl = document.getElementById("drawer-pitch-text");
    if (pitchTextEl) {
      const buyerMention = deal.matchedBuyers.length > 0 
        ? `We represent ${deal.matchedBuyers.length} pre-screened buyers looking for ${deal.industry} businesses in ${deal.country}`
        : `We represent serious qualified buyers actively seeking ${deal.industry} opportunities`;
      
      const pitch = `Hi! I saw your listing for "${deal.name}". ${buyerMention}. Are you available for a brief call this week to discuss potentially introducing a buyer? Best regards, Sarah (Dealflow M&A Desk)`;
      pitchTextEl.value = pitch;
    }

    // Assignee and Stage Selects
    const stageSel = document.getElementById("drawer-stage");
    if (stageSel) stageSel.value = state.stage || "unscreened";

    const assignSel = document.getElementById("drawer-assignee");
    if (assignSel) assignSel.value = state.assignee || "Unassigned";

    // Notes
    const notesEl = document.getElementById("drawer-notes");
    if (notesEl) notesEl.value = state.notes || "";
  }

  // Rapid Triage Mode (Screen 3)
  renderTriageCard() {
    const stage = document.getElementById("triage-card-stage");
    const counter = document.getElementById("triage-counter");
    const bar = document.getElementById("triage-bar-fill");
    if (!stage) return;

    if (this.triageIndex >= this.filteredDeals.length) {
      stage.innerHTML = `
        <div style="text-align:center;padding:40px;background:#fff;border-radius:16px;width:100%;border:1px solid var(--border)">
          <div style="font-size:40px;margin-bottom:10px">🎉</div>
          <h3>Queue Cleared!</h3>
          <p style="color:var(--text-muted);margin-top:4px">You have triaged all deals in this batch.</p>
          <button class="btn btn-primary" style="margin-top:14px" onclick="window.app.switchTab('inbox')">Return to Inbox</button>
        </div>
      `;
      if (counter) counter.textContent = `Completed!`;
      if (bar) bar.style.width = "100%";
      return;
    }

    const deal = this.filteredDeals[this.triageIndex];
    if (counter) counter.textContent = `Card ${this.triageIndex + 1} of ${this.filteredDeals.length}`;
    if (bar) bar.style.width = `${((this.triageIndex + 1) / this.filteredDeals.length) * 100}%`;

    const feeText = this.formatCurrencyUsd(deal.estFeeUsd);
    const askText = this.formatPrice(deal.ask, deal.cur, deal.askUsd);

    stage.innerHTML = `
      <div class="triage-card">
        <div class="card-header-row">
          <span class="tag ${deal.rep === "owner" ? "own" : "brk"}">
            ${deal.rep === "owner" ? "Direct Seller Post" : "Broker Represented"} • ${deal.source}
          </span>
          <div class="card-fee-col">
            <div class="card-fee-val text-green" style="font-size:20px">${feeText}</div>
            <div class="card-fee-lbl">Brokering Fee (10%)</div>
          </div>
        </div>

        <div>
          <h2 style="font-size:18px;font-weight:800;line-height:1.25">${this.escapeHTML(deal.name)}</h2>
          <div class="deal-subloc" style="font-size:13px;margin-top:3px">📍 ${this.escapeHTML(deal.loc || deal.country)}</div>
        </div>

        <div style="background:var(--bg-canvas);border:1px solid var(--border);border-radius:10px;padding:12px;">
          <div style="font-size:10.5px;font-weight:700;color:var(--text-muted);text-transform:uppercase;margin-bottom:4px">Listing Summary</div>
          <p style="font-size:13px;line-height:1.5;color:#334155">${this.escapeHTML(deal.blurb || "No detailed blurb provided.")}</p>
        </div>

        <div class="metrics-grid" style="grid-template-columns:1fr 1fr;padding:10px;">
          <div class="metric-item">
            <span class="lbl">Asking Price</span>
            <span class="num" style="font-size:15px">${askText}</span>
          </div>
          <div class="metric-item">
            <span class="lbl">Opp. Score</span>
            <span class="num text-green" style="font-size:15px">⚡ ${deal.oppScore}</span>
          </div>
        </div>

        <div style="font-size:12px;font-weight:700;color:var(--green-dark)">
          🎯 ${deal.matchedBuyers.length} CRM buyers match this sector
        </div>
      </div>
    `;
  }

  triageAction(stageName) {
    if (this.triageIndex < this.filteredDeals.length) {
      const deal = this.filteredDeals[this.triageIndex];
      this.updateDealState(deal.id, { stage: stageName });
      this.showToast(stageName === "shortlisted" ? "✓ Deal Shortlisted" : "✕ Deal Passed");
      this.triageIndex++;
      this.renderTriageCard();
    }
  }

  quickShortlistCurrent() {
    if (this.selectedDealId !== null) {
      this.updateDealState(this.selectedDealId, { stage: "shortlisted" });
      this.showToast("✓ Deal Shortlisted");
    } else if (this.activeTab === "triage") {
      this.triageAction("shortlisted");
    }
  }

  quickPassCurrent() {
    if (this.selectedDealId !== null) {
      this.updateDealState(this.selectedDealId, { stage: "passed" });
      this.showToast("✕ Deal Passed");
    } else if (this.activeTab === "triage") {
      this.triageAction("passed");
    }
  }

  // Pipeline Kanban
  renderPipelineKanban() {
    const stages = ["shortlisted", "contacted", "mandate", "matched", "closed"];
    const stageCounts = { shortlisted: 0, contacted: 0, mandate: 0, matched: 0, closed: 0 };
    const stageFees = { shortlisted: 0, contacted: 0, mandate: 0, matched: 0, closed: 0 };
    const stageDeals = { shortlisted: [], contacted: [], mandate: [], matched: [], closed: [] };

    this.listings.forEach(deal => {
      const state = this.getDealState(deal.id);
      if (stages.includes(state.stage)) {
        stageCounts[state.stage]++;
        stageFees[state.stage] += (deal.estFeeUsd || 10000);
        stageDeals[state.stage].push(deal);
      }
    });

    stages.forEach(st => {
      const countEl = document.getElementById(`count-stage-${st}`);
      if (countEl) countEl.textContent = stageCounts[st];
      const feeEl = document.getElementById(`fee-stage-${st}`);
      if (feeEl) feeEl.textContent = this.formatCurrencyUsd(stageFees[st]);

      const cardsContainer = document.getElementById(`cards-stage-${st}`);
      if (cardsContainer) {
        if (stageDeals[st].length === 0) {
          cardsContainer.innerHTML = `<div style="padding:16px;text-align:center;color:var(--text-light);font-size:11.5px">No deals in this stage</div>`;
        } else {
          cardsContainer.innerHTML = stageDeals[st].map(d => `
            <div style="background:#fff;border:1px solid var(--border);border-radius:8px;padding:10px;cursor:pointer;box-shadow:var(--shadow-sm)" onclick="window.app.openDrawer(${d.id})">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
                <span class="tag ${d.rep === 'owner' ? 'own' : 'brk'}">${d.source}</span>
                <b style="color:var(--green-dark);font-size:12px">${this.formatCurrencyUsd(d.estFeeUsd)}</b>
              </div>
              <div style="font-weight:700;font-size:13px;line-height:1.3;color:var(--text-main)">${this.escapeHTML(d.name)}</div>
              <div style="font-size:11px;color:var(--text-muted);margin-top:2px">📍 ${this.escapeHTML(d.loc || d.country)}</div>
            </div>
          `).join("");
        }
      }
    });
  }

  // Buyers Directory
  renderBuyersDirectory() {
    const grid = document.getElementById("buyers-grid");
    if (!grid) return;

    grid.innerHTML = this.buyers.map(b => `
      <div style="background:#fff;border:1px solid var(--border);border-radius:12px;padding:16px;box-shadow:var(--shadow-sm);display:flex;flex-direction:column;gap:8px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div>
            <h3 style="font-size:15px;font-weight:800">${this.escapeHTML(b.name)}</h3>
            <div style="font-size:12px;color:var(--text-muted);margin-top:2px">Contact: ${b.contact} • ${b.email}</div>
          </div>
          <span style="font-size:13px;font-weight:800;color:var(--green-dark);background:var(--green-soft);padding:3px 8px;border-radius:6px">
            Max $${(b.budgetUsd/1000000).toFixed(1)}M
          </span>
        </div>
        <div style="font-size:12.5px;color:#334155;background:var(--bg-canvas);border-radius:8px;padding:10px;border:1px solid var(--border)">
          <b>Mandate:</b> ${this.escapeHTML(b.criteria)}
        </div>
        <div style="display:flex;gap:5px;flex-wrap:wrap">
          ${b.focus.map(f => `<span class="tag fnb">${f}</span>`).join("")}
          ${b.region.map(r => `<span class="tag warn">${r}</span>`).join("")}
        </div>
      </div>
    `).join("");
  }

  switchTab(tab) {
    this.activeTab = tab;
    document.querySelectorAll(".nav-tab, .m-nav-item").forEach(b => {
      b.classList.toggle("active", b.dataset.tab === tab);
    });

    document.getElementById("pane-inbox")?.classList.toggle("hidden", tab !== "inbox");
    document.getElementById("pane-triage")?.classList.toggle("hidden", tab !== "triage");
    document.getElementById("pane-pipeline")?.classList.toggle("hidden", tab !== "pipeline");
    document.getElementById("pane-buyers")?.classList.toggle("hidden", tab !== "buyers");

    if (tab === "triage") {
      this.closeDrawer();
    }

    this.renderCurrentView();
  }

  formatPrice(natVal, cur, usdVal) {
    if (this.currentCurrency === "MYR") {
      if (cur === "MYR" && natVal) return `RM ${Number(natVal).toLocaleString()}`;
      if (usdVal) return `RM ${Math.round(usdVal * 4.5).toLocaleString()}`;
      return "—";
    } else {
      if (usdVal) return `$${Number(usdVal).toLocaleString()}`;
      if (natVal) return `${cur} ${Number(natVal).toLocaleString()}`;
      return "—";
    }
  }

  formatCurrencyUsd(amount) {
    if (!amount) return "$0";
    if (this.currentCurrency === "MYR") {
      return `RM ${Math.round(amount * 4.5).toLocaleString()}`;
    }
    return `$${Number(amount).toLocaleString()}`;
  }

  showToast(message) {
    const container = document.getElementById("toast-container");
    if (!container) return;
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 200);
    }, 2200);
  }

  exportCSV() {
    const headers = ["ID", "Name", "Source", "Rep", "Country", "Genre", "Industry", "Ask_USD", "Profit_USD", "Multiple", "Est_Fee_USD", "Stage", "Assignee", "Link"];
    const rows = this.filteredDeals.map(d => {
      const state = this.getDealState(d.id);
      return [
        d.id,
        `"${(d.name || "").replace(/"/g, '""')}"`,
        d.source,
        d.rep,
        d.country,
        `"${(d.genre || "").replace(/"/g, '""')}"`,
        d.industry,
        d.askUsd || "",
        d.profitUsd || "",
        d.mult || "",
        d.estFeeUsd || "",
        state.stage,
        state.assignee,
        `"${d.link || ""}"`
      ].join(",");
    });

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `dealflow_export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    this.showToast("CSV export downloaded");
  }

  escapeHTML(str) {
    if (!str) return "";
    return str.replace(/[&<>'"]/g, tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag));
  }
}

// Initialize when DOM ready
document.addEventListener("DOMContentLoaded", () => {
  window.app = new DealDeskApp();
});

