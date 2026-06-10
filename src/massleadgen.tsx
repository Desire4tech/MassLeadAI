import { useState, useRef, useCallback, useMemo, CSSProperties } from "react";
import { Lead } from "./types";

// ── DATA ────────────────────────────────────────────────────────────────────
const COUNTRIES = [
  "Afghanistan","Albania","Algeria","Angola","Argentina","Armenia","Australia","Austria","Azerbaijan",
  "Bahrain","Bangladesh","Belarus","Belgium","Benin","Bolivia","Bosnia","Botswana","Brazil","Bulgaria","Burkina Faso",
  "Burundi","Cambodia","Cameroon","Canada","Chad","Chile","China","Colombia","Congo (DRC)","Congo (Republic)",
  "Costa Rica","Côte d'Ivoire","Croatia","Cuba","Czech Republic","Denmark","Dominican Republic","Ecuador",
  "Egypt","El Salvador","Eritrea","Estonia","Ethiopia","Finland","France","Gabon","Gambia","Georgia",
  "Germany","Ghana","Greece","Guatemala","Guinea","Haiti","Honduras","Hungary","India","Indonesia","Iran",
  "Iraq","Ireland","Israel","Italy","Jamaica","Japan","Jordan","Kazakhstan","Kenya","Kuwait","Kyrgyzstan",
  "Laos","Latvia","Lebanon","Liberia","Libya","Lithuania","Luxembourg","Madagascar","Malawi","Malaysia",
  "Mali","Mauritania","Mauritius","Mexico","Moldova","Mongolia","Morocco","Mozambique","Myanmar","Namibia",
  "Nepal","Netherlands","New Zealand","Nicaragua","Niger","Nigeria","North Korea","Norway","Oman","Pakistan",
  "Palestine","Panama","Papua New Guinea","Paraguay","Peru","Philippines","Poland","Portugal","Qatar",
  "Romania","Russia","Rwanda","Saudi Arabia","Senegal","Serbia","Sierra Leone","Singapore","Somalia",
  "South Africa","South Korea","South Sudan","Spain","Sri Lanka","Sudan","Sweden","Switzerland","Syria",
  "Taiwan","Tajikistan","Tanzania","Thailand","Togo","Trinidad and Tobago","Tunisia","Turkey","Turkmenistan",
  "Uganda","Ukraine","United Arab Emirates","United Kingdom","United States","Uruguay","Uzbekistan",
  "Venezuela","Vietnam","Yemen","Zambia","Zimbabwe"
];

const AUDIENCE_TYPES = [
  { id: "business_owner", label: "Business Owners", icon: "🏢", desc: "SME owners, entrepreneurs, startup founders" },
  { id: "job_seeker", label: "Job Seekers", icon: "💼", desc: "Actively searching for employment" },
  { id: "student", label: "Students", icon: "🎓", desc: "University, college, or vocational students" },
  { id: "employee", label: "Employees", icon: "👔", desc: "Currently employed professionals" },
  { id: "unemployed", label: "Unemployed", icon: "🔍", desc: "Not currently working or in school" },
  { id: "freelancer", label: "Freelancers", icon: "💻", desc: "Independent contractors and gig workers" },
  { id: "digital_marketer", label: "Digital Marketers", icon: "📈", desc: "SEO experts, media buyers, PPC specialists, social managers" },
  { id: "sales_pro", label: "Sales Professionals", icon: "💰", desc: "Account executives, outbound sales reps, SDRs, business developers" },
  { id: "affiliate_marketer", label: "Affiliate Marketers", icon: "🔗", desc: "Niche bloggers, funnel builders, performance marketers" },
  { id: "graphic_designer", label: "Graphic Designers", icon: "🎨", desc: "Brand designers, illustrative artists, visual creators" },
  { id: "ui_ux_designer", label: "UI/UX Designers", icon: "📐", desc: "User experience researchers, wireframers, product designers" },
  { id: "automation_engineer", label: "Automation Engineers", icon: "🤖", desc: "QA engineers, workflow developers, robotic process automation" },
  { id: "writer", label: "Writers / Copywriters", icon: "✍️", desc: "Technical writers, ghostwriters, copy and script editors" },
  { id: "finance_accounting", label: "Finance & Accounting", icon: "🏦", desc: "Accountants, CPAs, auditors, financial planners, tax advisors" },
  { id: "content_creator", label: "Content Creators", icon: "🤳", desc: "YouTubers, influencers, copywriters, content publishers" },
  { id: "virtual_assistant", label: "Virtual Assistants", icon: "📞", desc: "Remote admin assistants, schedulers, online support stars" },
  { id: "developer", label: "Developers", icon: "⚙️", desc: "Frontend, backend, mobile app, and full-stack engineers" },
  { id: "project_manager", label: "Project Managers", icon: "📅", desc: "PMP, Scrum masters, functional managers, team coordinators" },
  { id: "cybersecurity", label: "Cybersecurity Specialists", icon: "🛡️", desc: "Security analysts, ethical hackers, cloud defense guards" },
  { id: "corp_member", label: "Corp Members (NYSC)", icon: "🟢", desc: "National Youth Service corps grads, active deployees" },
  { id: "retiree", label: "Retirees", icon: "🏖️", desc: "Former workers, pensioners, retired adults" },
  { id: "parent", label: "Parents / Guardians", icon: "👨‍👧", desc: "Parents, stay-at-home caregivers" },
  { id: "executive", label: "Corporate Executives", icon: "📊", desc: "C-suite, directors, senior managers" },
  { id: "government", label: "Government Workers", icon: "🏛️", desc: "Civil servants, public sector employees" },
  { id: "healthcare", label: "Healthcare Workers", icon: "🏥", desc: "Doctors, nurses, pharmacists, lab techs" },
  { id: "teacher", label: "Educators / Teachers", icon: "📚", desc: "School teachers, lecturers, trainers" },
  { id: "artisan", label: "Artisans / Tradespeople", icon: "🔧", desc: "Tailors, mechanics, plumbers, carpenters" },
  { id: "farmer", label: "Farmers / Agro workers", icon: "🌾", desc: "Agricultural workers and farmers" },
  { id: "religious", label: "Religious Leaders", icon: "⛪", desc: "Pastors, imams, traditional leaders" },
  { id: "ngo", label: "NGO / Community Leaders", icon: "🤝", desc: "Social workers, activists, community org leads" },
];

const BATCH_SIZES = [50, 100, 250, 500, 1000, 2000, 5000];
const GENDERS = ["Any", "Male", "Female"];
const AGE_RANGES = ["Any", "18–24", "25–34", "35–44", "45–54", "55–64", "65+"];
const INCOME_LEVELS = ["Any", "Low income", "Middle income", "Upper-middle income", "High income"];
const EDUCATION_LEVELS = ["Any", "No formal education", "Primary / O-Level", "Secondary / A-Level", "HND / ND", "Bachelor's Degree", "Postgraduate"];
const INTERESTS = ["Finance & Investment","Real Estate","Technology","Health & Wellness","Education","Religion","Agriculture","Fashion","Sports","Music & Entertainment","Politics","Travel","Food & Catering","E-commerce","Cryptocurrency"];

// Salvage a truncated JSON array — keeps all fully-closed objects
function repairJSON(raw) {
  // Strip markdown fences
  let s = raw.replace(/```json|```/g, "").trim();

  // Already valid?
  try { const r = JSON.parse(s); if (Array.isArray(r)) return r; } catch {}

  // Find array start
  const start = s.indexOf("[");
  if (start === -1) return null;
  s = s.slice(start);

  // Walk characters, track depth, collect complete objects
  const results = [];
  let depth = 0;
  let objStart = -1;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "{") {
      if (depth === 0) objStart = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && objStart !== -1) {
        try {
          const obj = JSON.parse(s.slice(objStart, i + 1));
          results.push(obj);
        } catch {}
        objStart = -1;
      }
    }
  }
  return results.length > 0 ? results : null;
}


function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function exportCSV(leads) {
  const headers = ["#","Full Name","Email","Email Verification Status","Email Verification Details","Phone","Gender","Age","Location","Country","Audience Type","Occupation","Education","Income Level","Interests","Platform","Status","Score","Notes"];
  const rows = leads.map((l, i) => [
    i + 1,
    `"${(l.name || "").replace(/"/g, '""')}"`,
    l.email,
    l.emailStatus || "Unverified",
    `"${(l.emailDetails || "").replace(/"/g, '""')}"`,
    l.phone,
    l.gender,
    l.age,
    `"${(l.location || "").replace(/"/g, '""')}"`,
    l.country,
    l.audienceType,
    `"${(l.occupation || "").replace(/"/g, '""')}"`,
    l.education,
    l.income,
    `"${(l.interests || []).join("; ")}"`,
    l.platform,
    l.status,
    l.score,
    `"${(l.notes || "").replace(/"/g, '""')}"`
  ]);
  const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `leads_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── SUB-COMPONENTS ───────────────────────────────────────────────────────────
interface ChipProps {
  selected: boolean;
  onClick: () => void;
  icon: string;
  label: string;
  desc: string;
  key?: string;
}

function Chip({ selected, onClick, icon, label, desc }: ChipProps) {
  return (
    <div className="audience-chip" onClick={onClick} style={{
      border: selected ? "2px solid #00C896" : "1.5px solid #2A2F3E",
      borderRadius: 12, padding: "12px 14px", cursor: "pointer",
      background: selected ? "rgba(0,200,150,0.08)" : "rgba(255,255,255,0.02)",
      transition: "all 0.15s", userSelect: "none"
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
        <span style={{ fontSize: 18 }}>{icon}</span>
        <span style={{ fontWeight: 700, fontSize: 13, color: selected ? "#00C896" : "#E2E8F0" }}>{label}</span>
        {selected && <span style={{ marginLeft: "auto", color: "#00C896", fontSize: 14 }}>✓</span>}
      </div>
      <div style={{ fontSize: 11, color: "#64748B", lineHeight: 1.4 }}>{desc}</div>
    </div>
  );
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  style?: CSSProperties;
}

function Select({ value, onChange, options, placeholder, style = {} }: SelectProps) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        background: "#161B27", border: "1.5px solid #2A2F3E", borderRadius: 10,
        padding: "11px 14px", color: value ? "#E2E8F0" : "#64748B",
        fontSize: 13, outline: "none", width: "100%", fontFamily: "inherit",
        cursor: "pointer", ...style
      }}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

interface MultiChipSelectProps {
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
}

function MultiChipSelect({ options, selected, onChange }: MultiChipSelectProps) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {options.map(opt => (
        <div
          key={opt}
          onClick={() => onChange(selected.includes(opt) ? selected.filter(v => v !== opt) : [...selected, opt])}
          style={{
            padding: "6px 14px", borderRadius: 20, cursor: "pointer", fontSize: 12, fontWeight: 600,
            border: selected.includes(opt) ? "1.5px solid #00C896" : "1.5px solid #2A2F3E",
            background: selected.includes(opt) ? "rgba(0,200,150,0.1)" : "transparent",
            color: selected.includes(opt) ? "#00C896" : "#94A3B8",
            transition: "all 0.12s", userSelect: "none"
          }}
        >{opt}</div>
      ))}
    </div>
  );
}

interface StatBoxProps {
  label: string;
  value: string | number;
  accent?: string;
}

function StatBox({ label, value, accent }: StatBoxProps) {
  return (
    <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid #2A2F3E", borderRadius: 12, padding: "14px 18px", flex: 1, minWidth: 100 }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: accent || "#E2E8F0", fontVariantNumeric: "tabular-nums" }}>{value}</div>
      <div style={{ fontSize: 11, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 2 }}>{label}</div>
    </div>
  );
}

// ── MAIN APP ─────────────────────────────────────────────────────────────────
export default function MassLeadGen() {
  const [step, setStep] = useState("config"); // config | generating | results

  // Config state
  const [country, setCountry] = useState("Nigeria");
  const [city, setCity] = useState("");
  const [audiences, setAudiences] = useState<string[]>([]);
  const [totalTarget, setTotalTarget] = useState(500);
  const [gender, setGender] = useState("Any");
  const [ageRange, setAgeRange] = useState("Any");
  const [incomeLevel, setIncomeLevel] = useState("Any");
  const [educationLevel, setEducationLevel] = useState("Any");
  const [interests, setInterests] = useState<string[]>([]);
  const [campaignGoal, setCampaignGoal] = useState("");

  // Generation state
  const [leads, setLeads] = useState<Lead[]>([]);
  const [progress, setProgress] = useState(0);
  const [batchLog, setBatchLog] = useState<{ msg: string; type: string; time: string }[]>([]);
  const [generating, setGenerating] = useState(false);
  const abortRef = useRef(false);

  // Email verification helper states
  const [verifyingAll, setVerifyingAll] = useState(false);
  const [verifyProgress, setVerifyProgress] = useState(0);
  const cancelVerifyRef = useRef(false);
  const [mailmeteorAuditId, setMailmeteorAuditId] = useState<string | null>(null);

  // Selection states
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);

  // Results state
  const [search, setSearch] = useState("");
  const [filterAudience, setFilterAudience] = useState("All");
  const [sortBy, setSortBy] = useState("score");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 100;

  // Single-email verifier method
  const verifySingleEmail = async (leadId: string, email: string) => {
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, emailStatus: "Verifying", emailDetails: "Testing syntax & checking DNS MX/A records..." } : l));

    try {
      const res = await fetch("/api/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setLeads(prev => prev.map(l => l.id === leadId ? { ...l, emailStatus: data.status, emailDetails: data.details, mailmeteor: data.mailmeteor } : l));
        return data.status;
      } else {
        throw new Error(data.error || "Server validation error");
      }
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      setLeads(prev => prev.map(l => l.id === leadId ? { ...l, emailStatus: "Risky", emailDetails: `Validation failed: ${errMsg}` } : l));
      return "Risky";
    }
  };

  // Bulk-email verifier method executing up to 6 concurrent workers with custom targets
  const startVerificationForLeads = async (leadsToVerify: Lead[]) => {
    if (verifyingAll) return;
    setVerifyingAll(true);
    setVerifyProgress(0);
    cancelVerifyRef.current = false;

    const queue = [...leadsToVerify];
    const totalToVerify = queue.length;
    let completed = 0;

    const CONCURRENCY = 6;
    const worker = async () => {
      while (queue.length > 0) {
        if (cancelVerifyRef.current) break;
        const lead = queue.shift();
        if (!lead) continue;

        await verifySingleEmail(lead.id, lead.email);
        completed++;
        setVerifyProgress(completed);
      }
    };

    const workers = Array.from({ length: Math.min(CONCURRENCY, totalToVerify) }, worker);
    await Promise.all(workers);

    setVerifyingAll(false);
  };

  const runBulkVerification = async () => {
    const targets = leads.filter(l => !l.emailStatus || l.emailStatus === "Unverified");
    await startVerificationForLeads(targets.length > 0 ? targets : leads);
  };

  const runSelectedVerification = async () => {
    const targets = leads.filter(l => selectedLeadIds.includes(l.id));
    if (targets.length === 0) return;
    await startVerificationForLeads(targets);
  };

  const cancelEmailVerification = () => {
    cancelVerifyRef.current = true;
    setVerifyingAll(false);
  };

  const locationLabel = city ? `${city}, ${country}` : country;

  const addLog = (msg, type = "info") => setBatchLog(prev => [...prev, { msg, type, time: new Date().toLocaleTimeString() }]);

  const buildPrompt = (batchNum, batchSize, existingNames) => {
    const audienceLabels = audiences.map(id => AUDIENCE_TYPES.find(a => a.id === id)?.label).filter(Boolean).join(", ");
    const exclusions = existingNames.slice(-20).join(", ");

    return `You are a lead generation data specialist. Generate exactly ${batchSize} realistic lead profiles.

TARGETING:
- Location: ${locationLabel}
- Audience: ${audienceLabels || "Mixed general population"}
- Gender: ${gender === "Any" ? "Mix" : gender}
- Age: ${ageRange === "Any" ? "18-65" : ageRange}
- Income: ${incomeLevel === "Any" ? "All" : incomeLevel}
- Education: ${educationLevel === "Any" ? "All" : educationLevel}
- Interests: ${interests.length > 0 ? interests.join(", ") : "General"}
- Goal: ${campaignGoal || "General outreach"}
- Batch: ${batchNum}

RULES:
- Names culturally authentic to ${country}
- Real-looking emails (gmail/yahoo/hotmail)
- Phone format for ${country} with country code
- Real locations in ${country}${city ? ` near ${city}` : ""}
- Vary audience types across list
- Avoid these names: ${exclusions || "none"}
- Scores 55-98
- platform: WhatsApp/Instagram/Facebook/LinkedIn/Email/SMS/TikTok
- status: Cold/Warm/Hot

Return ONLY a valid JSON array of ${batchSize} objects. No markdown, no text outside the array.
Schema: {"name":"","email":"","phone":"","gender":"","age":0,"location":"","country":"${country}","audienceType":"","occupation":"","education":"","income":"","interests":[],"platform":"","status":"","score":0,"notes":""}`;
  };

  const runGeneration = async () => {
    if (audiences.length === 0) return alert("Please select at least one audience type.");
    abortRef.current = false;
    setGenerating(true);
    setLeads([]);
    setBatchLog([]);
    setProgress(0);
    setStep("generating");

    const BATCH = 20;
    const totalBatches = Math.ceil(totalTarget / BATCH);
    let allLeads = [];
    let allNames = [];

    addLog(`Starting generation of ${totalTarget.toLocaleString()} leads in ${totalBatches} batches`, "start");

    for (let i = 0; i < totalBatches; i++) {
      if (abortRef.current) { addLog("Generation stopped by user.", "warn"); break; }

      const batchSize = Math.min(BATCH, totalTarget - allLeads.length);
      addLog(`Batch ${i + 1}/${totalBatches} — generating ${batchSize} leads for ${locationLabel}...`);

      try {
        const response = await fetch("/api/generate-leads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            batchNum: i + 1,
            batchSize: batchSize,
            locationLabel: locationLabel,
            audiences: audiences.map(id => AUDIENCE_TYPES.find(a => a.id === id)?.label).filter(Boolean),
            gender: gender,
            ageRange: ageRange,
            incomeLevel: incomeLevel,
            educationLevel: educationLevel,
            interests: interests,
            campaignGoal: campaignGoal,
            country: country,
            city: city,
            exclusions: allNames.slice(-20)
          })
        });

        const data = await response.json();

        // Check for API-level errors
        if (!response.ok || data.error) {
          throw new Error(data.error || `HTTP error ${response.status}`);
        }

        let batch = data.leads;
        if (!batch || !Array.isArray(batch) || batch.length === 0) {
          throw new Error("Could not parse any leads from response");
        }

        // Add unique IDs
        batch = batch.map((lead, idx) => ({
          ...lead,
          id: `${i}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
          batchNum: i + 1
        }));

        allNames = [...allNames, ...batch.map(l => l.name)];
        allLeads = [...allLeads, ...batch];
        setLeads([...allLeads]);
        setProgress(Math.round((allLeads.length / totalTarget) * 100));
        addLog(`✓ Batch ${i + 1} complete — ${batch.length} leads added (total: ${allLeads.length.toLocaleString()})`, "success");

        // Small delay to avoid rate limits on large runs
        if (i < totalBatches - 1) await new Promise(r => setTimeout(r, 400));

      } catch (err) {
        addLog(`✗ Batch ${i + 1} failed: ${err.message} — retrying...`, "error");
        await new Promise(r => setTimeout(r, 2000));
        // retry once
        try {
          const response2 = await fetch("/api/generate-leads", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              batchNum: i + 1,
              batchSize: batchSize,
              locationLabel: locationLabel,
              audiences: audiences.map(id => AUDIENCE_TYPES.find(a => a.id === id)?.label).filter(Boolean),
              gender: gender,
              ageRange: ageRange,
              incomeLevel: incomeLevel,
              educationLevel: educationLevel,
              interests: interests,
              campaignGoal: campaignGoal,
              country: country,
              city: city,
              exclusions: allNames.slice(-20)
            })
          });
          const data2 = await response2.json();
          if (!response2.ok || data2.error) {
            throw new Error(data2.error || `HTTP error ${response2.status}`);
          }
          let batch2 = data2.leads;
          if (batch2 && Array.isArray(batch2) && batch2.length > 0) {
            batch2 = batch2.map((lead, idx) => ({ ...lead, id: `${i}r-${idx}-${Math.random().toString(36).slice(2, 7)}`, batchNum: i + 1 }));
            allNames = [...allNames, ...batch2.map(l => l.name)];
            allLeads = [...allLeads, ...batch2];
            setLeads([...allLeads]);
            setProgress(Math.round((allLeads.length / totalTarget) * 100));
            addLog(`✓ Batch ${i + 1} retry succeeded — ${batch2.length} leads added (total: ${allLeads.length.toLocaleString()})`, "success");
          } else {
            addLog(`✗ Batch ${i + 1} retry also failed — skipping`, "error");
          }
        } catch (err2) {
          addLog(`✗ Batch ${i + 1} retry failed: ${err2.message} — skipping`, "error");
        }
        await new Promise(r => setTimeout(r, 800));
      }
    }

    setGenerating(false);
    setProgress(100);
    addLog(`🎉 Generation complete — ${allLeads.length.toLocaleString()} leads ready`, "done");
    setStep("results");
  };

  const stopGeneration = () => { abortRef.current = true; };

  // Filtered & sorted leads
  const processedLeads = useMemo(() => {
    let out = [...leads];
    if (search) {
      const q = search.toLowerCase();
      out = out.filter(l =>
        l.name?.toLowerCase().includes(q) ||
        l.email?.toLowerCase().includes(q) ||
        l.location?.toLowerCase().includes(q) ||
        l.occupation?.toLowerCase().includes(q)
      );
    }
    if (filterAudience !== "All") out = out.filter(l => l.audienceType === filterAudience);
    if (sortBy === "score") out.sort((a, b) => b.score - a.score);
    else if (sortBy === "name") out.sort((a, b) => a.name?.localeCompare(b.name));
    else if (sortBy === "status") out.sort((a, b) => {
      const rank = { Hot: 0, Warm: 1, Cold: 2 };
      return (rank[a.status] ?? 3) - (rank[b.status] ?? 3);
    });
    return out;
  }, [leads, search, filterAudience, sortBy]);

  const paginated = processedLeads.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(processedLeads.length / PAGE_SIZE);

  const audienceOptions: string[] = ["All", ...Array.from(new Set(leads.map((l: Lead) => l.audienceType).filter(Boolean) as string[]))];
  const hotCount = leads.filter(l => l.status === "Hot").length;
  const warmCount = leads.filter(l => l.status === "Warm").length;

  const verifiedCount = leads.filter(l => l.emailStatus && l.emailStatus !== "Unverified" && l.emailStatus !== "Verifying").length;
  const deliverableCount = leads.filter(l => l.emailStatus === "Deliverable").length;
  const catchAllCount = leads.filter(l => l.emailStatus === "Catch-All").length;
  const riskyCount = leads.filter(l => l.emailStatus === "Risky").length;
  const undeliverableCount = leads.filter(l => l.emailStatus === "Undeliverable").length;
  const unverifiedCount = leads.length - verifiedCount - leads.filter(l => l.emailStatus === "Verifying").length;

  const statusColor = { Hot: "#FF4757", Warm: "#FFA502", Cold: "#54A0FF" };
  const statusBg = { Hot: "rgba(255,71,87,0.12)", Warm: "rgba(255,165,2,0.12)", Cold: "rgba(84,160,255,0.12)" };

  const base = { fontFamily: "'Inter', -apple-system, sans-serif", background: "#0C1018", color: "#E2E8F0", minHeight: "100vh" };

  const inputStyle = {
    background: "#161B27", border: "1.5px solid #2A2F3E", borderRadius: 10,
    padding: "11px 14px", color: "#E2E8F0", fontSize: 13, outline: "none",
    width: "100%", fontFamily: "inherit", boxSizing: "border-box"
  };

  const labelStyle = {
    fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase",
    letterSpacing: "0.07em", marginBottom: 8, display: "block"
  };

  return (
    <div style={base}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }
        * { box-sizing: border-box; }
        input:focus, select:focus, textarea:focus { border-color: #00C896 !important; }
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: #0C1018; }
        ::-webkit-scrollbar-thumb { background: #2A2F3E; border-radius: 3px; }
        tr:hover td { background: rgba(0,200,150,0.03) !important; }
        .audience-chip {
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
        }
        .audience-chip:hover {
          transform: translateY(-2px);
          border-color: rgba(0, 200, 150, 0.45) !important;
          background: rgba(0, 200, 150, 0.04) !important;
          box-shadow: 0 6px 16px -4px rgba(0, 200, 150, 0.15) !important;
        }
        .audience-chip:active {
          transform: translateY(0);
        }
        .verify-single-btn {
          transition: all 0.15s ease !important;
        }
        .verify-single-btn:hover {
          border-color: #00C896 !important;
          background: rgba(0, 200, 150, 0.06) !important;
          color: #00C896 !important;
          box-shadow: 0 4px 10px -2px rgba(0, 200, 150, 0.1) !important;
        }
      `}</style>

      {/* ── TOP NAV ── */}
      <div style={{ background: "#0C1018", borderBottom: "1px solid #1E2533", padding: "0 28px", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: 1400, margin: "0 auto", height: 58, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: "linear-gradient(135deg, #00C896, #00A878)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🎯</div>
            <div>
              <span style={{ fontWeight: 900, fontSize: 17, color: "#fff", letterSpacing: "-0.03em" }}>MassLead</span>
              <span style={{ fontWeight: 900, fontSize: 17, color: "#00C896", letterSpacing: "-0.03em" }}>AI</span>
              <span style={{ fontSize: 10, background: "#1E2533", color: "#64748B", padding: "2px 7px", borderRadius: 20, marginLeft: 8, fontWeight: 600 }}>BETA</span>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            {["config", "generating", "results"].map((s, i) => (
              <div key={s} onClick={() => leads.length > 0 || s === "config" ? setStep(s) : null} style={{
                padding: "6px 16px", borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: "pointer",
                background: step === s ? "rgba(0,200,150,0.15)" : "transparent",
                color: step === s ? "#00C896" : "#64748B",
                border: step === s ? "1px solid rgba(0,200,150,0.3)" : "1px solid transparent"
              }}>
                {["① Configure", "② Generate", "③ Results"][i]}
              </div>
            ))}
          </div>

          {leads.length > 0 && (
            <button onClick={() => exportCSV(leads)} style={{
              padding: "8px 18px", borderRadius: 10, border: "1px solid #00C896",
              background: "rgba(0,200,150,0.08)", color: "#00C896", fontSize: 12, fontWeight: 700, cursor: "pointer"
            }}>
              ↓ Export {leads.length.toLocaleString()} CSV
            </button>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
           STEP 1: CONFIG
      ══════════════════════════════════════════════════════ */}
      {step === "config" && (
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 28px", animation: "fadeUp 0.3s ease" }}>

          {/* Hero */}
          <div style={{ marginBottom: 36, textAlign: "center" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#00C896", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 10 }}>AI-Powered Mass Lead Generation</div>
            <h1 style={{ margin: 0, fontSize: 36, fontWeight: 900, color: "#fff", letterSpacing: "-0.04em", lineHeight: 1.15 }}>
              Generate thousands of<br />
              <span style={{ color: "#00C896" }}>targeted leads</span> in minutes
            </h1>
            <p style={{ margin: "14px 0 0", color: "#64748B", fontSize: 14 }}>
              Business owners, job seekers, students, employees — any audience, any country, any city.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>

            {/* LEFT COLUMN */}
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

              {/* Location */}
              <div style={{ background: "#111827", border: "1px solid #1E2533", borderRadius: 16, padding: 24 }}>
                <div style={{ fontWeight: 800, fontSize: 15, color: "#fff", marginBottom: 4 }}>📍 Location Targeting</div>
                <div style={{ fontSize: 12, color: "#64748B", marginBottom: 18 }}>Target a specific country, then narrow to a city or region.</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div>
                    <label style={labelStyle}>Country *</label>
                    <Select value={country} onChange={setCountry} options={COUNTRIES} />
                  </div>
                  <div>
                    <label style={labelStyle}>City / State / Region (optional)</label>
                    <input
                      value={city}
                      onChange={e => setCity(e.target.value)}
                      placeholder={`e.g. Lagos, Abuja, Port Harcourt...`}
                      style={inputStyle}
                    />
                  </div>
                </div>
              </div>

              {/* Volume */}
              <div style={{ background: "#111827", border: "1px solid #1E2533", borderRadius: 16, padding: 24 }}>
                <div style={{ fontWeight: 800, fontSize: 15, color: "#fff", marginBottom: 4 }}>📊 Lead Volume</div>
                <div style={{ fontSize: 12, color: "#64748B", marginBottom: 18 }}>How many leads do you want to generate?</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                  {BATCH_SIZES.map(n => (
                    <div
                      key={n}
                      onClick={() => setTotalTarget(n)}
                      style={{
                        padding: "12px 8px", borderRadius: 10, textAlign: "center", cursor: "pointer",
                        border: totalTarget === n ? "2px solid #00C896" : "1.5px solid #2A2F3E",
                        background: totalTarget === n ? "rgba(0,200,150,0.08)" : "transparent",
                        transition: "all 0.12s"
                      }}
                    >
                      <div style={{ fontWeight: 800, fontSize: 15, color: totalTarget === n ? "#00C896" : "#E2E8F0" }}>
                        {n >= 1000 ? `${n / 1000}K` : n}
                      </div>
                      <div style={{ fontSize: 10, color: "#64748B", marginTop: 2 }}>leads</div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 14, padding: "10px 14px", background: "rgba(0,200,150,0.05)", borderRadius: 10, fontSize: 12, color: "#64748B" }}>
                  ⏱ Estimated time: <strong style={{ color: "#00C896" }}>~{Math.ceil(totalTarget / 20) * 5}–{Math.ceil(totalTarget / 20) * 8} seconds</strong> · {Math.ceil(totalTarget / 20)} batches of 20
                </div>
              </div>

              {/* Demographics */}
              <div style={{ background: "#111827", border: "1px solid #1E2533", borderRadius: 16, padding: 24 }}>
                <div style={{ fontWeight: 800, fontSize: 15, color: "#fff", marginBottom: 16 }}>👤 Demographics</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  <div>
                    <label style={labelStyle}>Gender</label>
                    <Select value={gender} onChange={setGender} options={GENDERS} />
                  </div>
                  <div>
                    <label style={labelStyle}>Age Range</label>
                    <Select value={ageRange} onChange={setAgeRange} options={AGE_RANGES} />
                  </div>
                  <div>
                    <label style={labelStyle}>Income Level</label>
                    <Select value={incomeLevel} onChange={setIncomeLevel} options={INCOME_LEVELS} />
                  </div>
                  <div>
                    <label style={labelStyle}>Education Level</label>
                    <Select value={educationLevel} onChange={setEducationLevel} options={EDUCATION_LEVELS} />
                  </div>
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN */}
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

              {/* Audience Types */}
              <div id="audience-types-card" style={{ background: "#111827", border: "1px solid #1E2533", borderRadius: 16, padding: 24 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <div style={{ fontWeight: 800, fontSize: 15, color: "#fff" }}>🎯 Audience Types *</div>
                  {audiences.length > 0 && (
                    <span style={{ fontSize: 11, background: "rgba(0,200,150,0.12)", color: "#00C896", padding: "2px 8px", borderRadius: 12, fontWeight: 700, letterSpacing: "0.02em" }}>
                      {audiences.length} Selected
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: "#64748B", marginBottom: 16 }}>Select one or more groups to target. Mix them for diverse lists.</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {AUDIENCE_TYPES.map(a => (
                    <Chip
                      key={a.id}
                      icon={a.icon}
                      label={a.label}
                      desc={a.desc}
                      selected={audiences.includes(a.id)}
                      onClick={() => setAudiences(prev => prev.includes(a.id) ? prev.filter(v => v !== a.id) : [...prev, a.id])}
                    />
                  ))}
                </div>
                {audiences.length === 0 && (
                  <div style={{ marginTop: 10, fontSize: 11, color: "#FF4757", textAlign: "center" }}>Select at least one audience type to continue</div>
                )}
              </div>

              {/* Interests & Goal */}
              <div style={{ background: "#111827", border: "1px solid #1E2533", borderRadius: 16, padding: 24 }}>
                <div style={{ fontWeight: 800, fontSize: 15, color: "#fff", marginBottom: 16 }}>🧩 Interests & Campaign Goal</div>
                <div style={{ marginBottom: 16 }}>
                  <label style={labelStyle}>Interests to Target</label>
                  <MultiChipSelect options={INTERESTS} selected={interests} onChange={setInterests} />
                </div>
                <div>
                  <label style={labelStyle}>Campaign Goal / Context</label>
                  <textarea
                    value={campaignGoal}
                    onChange={e => setCampaignGoal(e.target.value)}
                    placeholder="Describe what you're promoting or why you need these leads. e.g. 'Selling online courses to unemployed youth in Lagos who want to learn digital skills'"
                    style={{ ...inputStyle, minHeight: 80, resize: "vertical", lineHeight: 1.6 }}
                  />
                </div>
              </div>

              {/* Summary & CTA */}
              <div style={{ background: "linear-gradient(135deg, rgba(0,200,150,0.1), rgba(0,168,120,0.05))", border: "1.5px solid rgba(0,200,150,0.25)", borderRadius: 16, padding: 24 }}>
                <div style={{ fontWeight: 800, fontSize: 15, color: "#fff", marginBottom: 14 }}>Campaign Summary</div>
                {[
                  ["Location", locationLabel],
                  ["Audience", audiences.length > 0 ? audiences.map(id => AUDIENCE_TYPES.find(a => a.id === id)?.label).join(", ") : "Not selected"],
                  ["Volume", `${totalTarget.toLocaleString()} leads`],
                  ["Demographics", [gender !== "Any" && gender, ageRange !== "Any" && ageRange, incomeLevel !== "Any" && incomeLevel].filter(Boolean).join(" · ") || "All"],
                  ["Interests", interests.length > 0 ? interests.slice(0, 3).join(", ") + (interests.length > 3 ? ` +${interests.length - 3}` : "") : "General"],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 12 }}>
                    <span style={{ color: "#64748B" }}>{k}</span>
                    <span style={{ color: "#E2E8F0", fontWeight: 600, maxWidth: "60%", textAlign: "right" }}>{v}</span>
                  </div>
                ))}

                <button
                  onClick={runGeneration}
                  disabled={audiences.length === 0}
                  style={{
                    width: "100%", marginTop: 16, padding: "16px", borderRadius: 12, border: "none",
                    background: audiences.length > 0 ? "linear-gradient(135deg, #00C896, #00A878)" : "#2A2F3E",
                    color: audiences.length > 0 ? "#000" : "#64748B",
                    fontSize: 15, fontWeight: 900, cursor: audiences.length > 0 ? "pointer" : "not-allowed",
                    letterSpacing: "-0.02em", boxShadow: audiences.length > 0 ? "0 6px 24px rgba(0,200,150,0.3)" : "none",
                    transition: "all 0.2s"
                  }}
                >
                  🚀 Generate {totalTarget.toLocaleString()} Leads
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
           STEP 2: GENERATING
      ══════════════════════════════════════════════════════ */}
      {step === "generating" && (
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "48px 28px", animation: "fadeUp 0.3s ease" }}>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <div style={{ fontSize: 48, marginBottom: 16, animation: "blink 1.5s ease infinite" }}>⚡</div>
            <h2 style={{ margin: 0, fontSize: 28, fontWeight: 900, color: "#fff", letterSpacing: "-0.03em" }}>
              Generating {totalTarget.toLocaleString()} leads
            </h2>
            <div style={{ fontSize: 14, color: "#64748B", marginTop: 8 }}>
              {locationLabel} · {audiences.map(id => AUDIENCE_TYPES.find(a => a.id === id)?.label).join(", ")}
            </div>
          </div>

          {/* Progress */}
          <div style={{ background: "#111827", border: "1px solid #1E2533", borderRadius: 16, padding: 28, marginBottom: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: "#E2E8F0" }}>
                {leads.length.toLocaleString()} / {totalTarget.toLocaleString()} leads generated
              </span>
              <span style={{ fontWeight: 800, fontSize: 15, color: "#00C896" }}>{progress}%</span>
            </div>
            <div style={{ background: "#1E2533", borderRadius: 99, height: 10, overflow: "hidden" }}>
              <div style={{
                height: "100%", borderRadius: 99, width: `${progress}%`,
                background: "linear-gradient(90deg, #00C896, #00FFB3)",
                transition: "width 0.4s ease",
                boxShadow: "0 0 12px rgba(0,200,150,0.5)"
              }} />
            </div>

            {/* Stats */}
            <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
              <StatBox label="Generated" value={leads.length.toLocaleString()} accent="#00C896" />
              <StatBox label="Hot Leads" value={hotCount.toLocaleString()} accent="#FF4757" />
              <StatBox label="Warm Leads" value={warmCount.toLocaleString()} accent="#FFA502" />
              <StatBox label="Batches Done" value={`${Math.floor(leads.length / 20)} / ${Math.ceil(totalTarget / 20)}`} />
            </div>

            {generating && (
              <button onClick={stopGeneration} style={{
                marginTop: 20, padding: "10px 24px", borderRadius: 10, border: "1px solid #FF4757",
                background: "rgba(255,71,87,0.1)", color: "#FF4757", fontSize: 13, fontWeight: 700, cursor: "pointer", width: "100%"
              }}>
                ⏹ Stop Generation (keep {leads.length.toLocaleString()} leads so far)
              </button>
            )}

            {!generating && leads.length > 0 && (
              <button onClick={() => setStep("results")} style={{
                marginTop: 20, padding: "14px", borderRadius: 12, border: "none",
                background: "linear-gradient(135deg, #00C896, #00A878)", color: "#000",
                fontSize: 14, fontWeight: 900, cursor: "pointer", width: "100%"
              }}>
                View {leads.length.toLocaleString()} Leads →
              </button>
            )}
          </div>

          {/* Live log */}
          <div style={{ background: "#0A0E18", border: "1px solid #1E2533", borderRadius: 16, padding: 20, maxHeight: 300, overflowY: "auto" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>Live Generation Log</div>
            {batchLog.map((entry, i) => (
              <div key={i} style={{ fontSize: 12, marginBottom: 5, display: "flex", gap: 10 }}>
                <span style={{ color: "#2A2F3E", flexShrink: 0 }}>{entry.time}</span>
                <span style={{ color: entry.type === "success" ? "#00C896" : entry.type === "error" ? "#FF4757" : entry.type === "done" ? "#FFD700" : entry.type === "start" ? "#818CF8" : "#94A3B8" }}>
                  {entry.msg}
                </span>
              </div>
            ))}
            {generating && (
              <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#00C896", animation: "blink 1s ease infinite" }} />
                <span style={{ fontSize: 12, color: "#64748B" }}>Processing...</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
           STEP 3: RESULTS
      ══════════════════════════════════════════════════════ */}
      {step === "results" && (
        <div style={{ maxWidth: 1400, margin: "0 auto", padding: "24px 28px", animation: "fadeUp 0.3s ease" }}>

          {/* Stats row */}
          <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
            <StatBox label="Total Leads" value={leads.length.toLocaleString()} accent="#E2E8F0" />
            <StatBox label="🔥 Hot" value={hotCount.toLocaleString()} accent="#FF4757" />
            <StatBox label="🌡 Warm" value={warmCount.toLocaleString()} accent="#FFA502" />
            <StatBox label="❄ Cold" value={(leads.length - hotCount - warmCount).toLocaleString()} accent="#54A0FF" />
            <StatBox label="Avg Score" value={leads.length > 0 ? Math.round(leads.reduce((a, l) => a + (l.score || 0), 0) / leads.length) + "%" : "—"} accent="#00C896" />
            <StatBox label="Location" value={locationLabel} />
          </div>

          {/* Lead Email Quality & DNS Verification Card */}
          <div style={{
            background: "#111827",
            border: "1px solid #1E2533",
            borderRadius: 16,
            padding: 24,
            marginBottom: 24,
            animation: "fadeUp 0.3s ease"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 18 }}>🛡️</span>
                  <div style={{ fontWeight: 800, fontSize: 16, color: "#fff" }}>Lead Email Quality & DNS Verification</div>
                </div>
                <div style={{ fontSize: 12, color: "#64748B", marginTop: 4, maxWidth: 800 }}>
                  Evaluate outbound bounce risks in real-time. Our validation assistant runs live syntax pattern testing, evaluates disposable burner domain databases, and queries live global DNS MX servers to confirm mail delivery capability.
                </div>
              </div>
              
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                {selectedLeadIds.length > 0 && !verifyingAll && (
                  <button
                    onClick={runSelectedVerification}
                    style={{
                      padding: "10px 20px", borderRadius: 10, border: "2px solid #00C896",
                      background: "rgba(0, 200, 150, 0.15)", color: "#00C896",
                      fontSize: 13, fontWeight: 900, cursor: "pointer",
                      boxShadow: "0 0 16px rgba(0,200,150,0.25)", transition: "all 0.15s ease"
                    }}
                  >
                    🔍 Verify Selected ({selectedLeadIds.length})
                  </button>
                )}

                {!verifyingAll && verifiedCount === 0 && (
                  <button
                    onClick={runBulkVerification}
                    style={{
                      padding: "10px 20px", borderRadius: 10, border: "none",
                      background: "linear-gradient(135deg, #00C896, #00A878)", color: "#000",
                      fontSize: 13, fontWeight: 900, cursor: "pointer",
                      boxShadow: "0 4px 14px rgba(0,200,150,0.2)"
                    }}
                  >
                    🛡️ Verify All Emails
                  </button>
                )}

                {verifyingAll && (
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <button
                      onClick={cancelEmailVerification}
                      style={{
                        padding: "8px 16px", borderRadius: 8, border: "1px solid #FF4757",
                        background: "rgba(255,71,87,0.08)", color: "#FF4757",
                        fontSize: 12, fontWeight: 700, cursor: "pointer"
                      }}
                    >
                      ⏹ Stop Verification
                    </button>
                  </div>
                )}

                {!verifyingAll && verifiedCount > 0 && (
                  <button
                    onClick={runBulkVerification}
                    style={{
                      padding: "8px 16px", borderRadius: 8, border: "1px solid #00C896",
                      background: "transparent", color: "#00C896",
                      fontSize: 12, fontWeight: 700, cursor: "pointer"
                    }}
                  >
                    🔄 Re-run DNS Checks ({unverifiedCount > 0 ? `${unverifiedCount} left` : "all done"})
                  </button>
                )}
              </div>
            </div>

            {/* Active Running State banner */}
            {verifyingAll && (
              <div style={{ marginTop: 20, padding: "16px", background: "rgba(0,200,150,0.04)", borderRadius: 12, border: "1px dashed rgba(0,200,150,0.2)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#00C896", display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#00C896", animation: "blink 1s infinite" }} />
                    Running parallel asynchronous MX lookup requests...
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: "#E2E8F0" }}>
                    {verifyProgress} / {leads.length} inboxes checked ({Math.round((verifyProgress / leads.length) * 100)}%)
                  </span>
                </div>
                <div style={{ background: "#2A2F3E", height: 6, borderRadius: 3, overflow: "hidden" }}>
                  <div style={{
                    background: "linear-gradient(90deg, #00C896, #00FFB3)",
                    height: "100%", width: `${(verifyProgress / leads.length) * 100}%`,
                    transition: "width 0.2s"
                  }} />
                </div>
              </div>
            )}

            {/* Verification Stats breakdowns if any are verified */}
            {(verifiedCount > 0 || verifyingAll) && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginTop: 20 }}>
                
                <div style={{ background: "rgba(0,200,150,0.06)", border: "1px solid rgba(0,200,150,0.15)", borderRadius: 12, padding: "12px 16px" }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: "#00C896" }}>{deliverableCount}</div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 2 }}>✔️ Deliverable</div>
                </div>

                <div style={{ background: "rgba(129,140,248,0.06)", border: "1px solid rgba(129,140,248,0.15)", borderRadius: 12, padding: "12px 16px" }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: "#818CF8" }}>{catchAllCount}</div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 2 }}>👥 Catch-All</div>
                </div>

                <div style={{ background: "rgba(255,165,2,0.06)", border: "1px solid rgba(255,165,2,0.15)", borderRadius: 12, padding: "12px 16px" }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: "#FFA502" }}>{riskyCount}</div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 2 }}>⚠️ Risky (Dispos.)</div>
                </div>

                <div style={{ background: "rgba(255,71,87,0.06)", border: "1px solid rgba(255,71,87,0.15)", borderRadius: 12, padding: "12px 16px" }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: "#FF4757" }}>{undeliverableCount}</div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 2 }}>❌ Inactive</div>
                </div>

                <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 12, padding: "12px 16px" }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: "#94A3B8" }}>{unverifiedCount}</div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 2 }}>⏳ Unverified</div>
                </div>

              </div>
            )}
          </div>

          {/* Controls */}
          <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(0); }}
              placeholder="Search name, email, location, occupation..."
              style={{ ...inputStyle, width: 280 }}
            />
            <Select value={filterAudience} onChange={v => { setFilterAudience(v); setPage(0); }} options={audienceOptions} style={{ width: 200 }} />
            <Select value={sortBy} onChange={setSortBy} options={["score", "name", "status"]}
              style={{ width: 150 }} />
            <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              <button onClick={() => exportCSV(processedLeads)} style={{
                padding: "9px 18px", borderRadius: 10, border: "1px solid #00C896",
                background: "rgba(0,200,150,0.08)", color: "#00C896", fontSize: 12, fontWeight: 700, cursor: "pointer"
              }}>↓ Export Filtered ({processedLeads.length.toLocaleString()})</button>
              <button onClick={() => { setStep("config"); setLeads([]); }} style={{
                padding: "9px 18px", borderRadius: 10, border: "1px solid #2A2F3E",
                background: "transparent", color: "#94A3B8", fontSize: 12, fontWeight: 700, cursor: "pointer"
              }}>+ New Campaign</button>
            </div>
          </div>

          {/* Dynamic Selection Alert Action Bar */}
          {selectedLeadIds.length > 0 && (
            <div style={{
              background: "linear-gradient(90deg, rgba(0,200,150,0.06), rgba(129,140,248,0.06))",
              border: "1px solid rgba(0,200,150,0.25)",
              borderRadius: 12,
              padding: "12px 20px",
              marginBottom: 16,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              animation: "fadeUp 0.22s ease-out"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 16 }}>📋</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#E2E8F0" }}>
                  Selected <strong style={{ color: "#00C896", padding: "0 2px" }}>{selectedLeadIds.length}</strong> {selectedLeadIds.length === 1 ? "lead" : "leads"}
                </span>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={runSelectedVerification}
                  disabled={verifyingAll}
                  style={{
                    padding: "6px 14px", borderRadius: 8, border: "none",
                    background: "#00C896", color: "#000",
                    fontSize: 11, fontWeight: 800, cursor: "pointer",
                    opacity: verifyingAll ? 0.6 : 1, transition: "all 0.15s ease"
                  }}
                >
                  🛡️ Verify Mailboxes of Selected
                </button>
                <button
                  onClick={() => {
                    const markedHotLeads = leads.map(l => selectedLeadIds.includes(l.id) ? { ...l, status: "Hot" as const } : l);
                    setLeads(markedHotLeads);
                  }}
                  style={{
                    padding: "6px 14px", borderRadius: 8, border: "1px solid rgba(255, 71, 87, 0.4)",
                    background: "rgba(255, 71, 87, 0.08)", color: "#FF4757",
                    fontSize: 11, fontWeight: 700, cursor: "pointer", transition: "all 0.15s ease"
                  }}
                >
                  🔥 Bulk Set 'Hot'
                </button>
                <button
                  onClick={() => setSelectedLeadIds([])}
                  style={{
                    padding: "6px 14px", borderRadius: 8, border: "1px solid #2A2F3E",
                    background: "transparent", color: "#94A3B8",
                    fontSize: 11, fontWeight: 700, cursor: "pointer", transition: "all 0.15s ease"
                  }}
                >
                  🧹 Clear Selection
                </button>
              </div>
            </div>
          )}

          {/* Table */}
          <div style={{ background: "#111827", border: "1px solid #1E2533", borderRadius: 16, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#0C1018", borderBottom: "1px solid #1E2533" }}>
                    <th style={{ padding: "12px 14px", textAlign: "center", width: 44 }}>
                      <input
                        type="checkbox"
                        checked={paginated.length > 0 && paginated.every(l => selectedLeadIds.includes(l.id))}
                        onChange={() => {
                          const paginatedIds = paginated.map(l => l.id);
                          const allSelected = paginatedIds.every(id => selectedLeadIds.includes(id));
                          if (allSelected) {
                            setSelectedLeadIds(prev => prev.filter(id => !paginatedIds.includes(id)));
                          } else {
                            setSelectedLeadIds(prev => Array.from(new Set([...prev, ...paginatedIds])));
                          }
                        }}
                        style={{ width: 14, height: 14, accentColor: "#00C896", cursor: "pointer", verticalAlign: "middle" }}
                      />
                    </th>
                    <th style={{ padding: "12px 14px", textAlign: "left", fontWeight: 700, color: "#64748B", whiteSpace: "nowrap", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", width: 50 }}>#</th>
                    {["Name", "Email", "Verification", "Phone", "Location", "Audience", "Occupation", "Platform", "Status", "Score", "Notes"].map(h => (
                      <th key={h} style={{ padding: "12px 14px", textAlign: "left", fontWeight: 700, color: "#64748B", whiteSpace: "nowrap", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((lead, i) => (
                    <tr key={lead.id} style={{ 
                      borderBottom: "1px solid #1A2030",
                      background: selectedLeadIds.includes(lead.id) ? "rgba(0, 200, 150, 0.03)" : "transparent"
                    }}>
                      <td style={{ padding: "11px 14px", textAlign: "center", verticalAlign: "middle" }}>
                        <input
                          type="checkbox"
                          checked={selectedLeadIds.includes(lead.id)}
                          onChange={() => {
                            setSelectedLeadIds(prev =>
                              prev.includes(lead.id) ? prev.filter(id => id !== lead.id) : [...prev, lead.id]
                            );
                          }}
                          style={{ width: 14, height: 14, accentColor: "#00C896", cursor: "pointer", verticalAlign: "middle" }}
                        />
                      </td>
                      <td style={{ padding: "11px 14px", color: "#2A2F3E", fontWeight: 700 }}>{page * PAGE_SIZE + i + 1}</td>
                      <td style={{ padding: "11px 14px", color: "#E2E8F0", fontWeight: 600, whiteSpace: "nowrap" }}>
                        <div>{lead.name}</div>
                        <div style={{ fontSize: 10, color: "#64748B" }}>{lead.gender}, {lead.age}</div>
                      </td>
                      <td style={{ padding: "11px 14px", color: "#94A3B8", whiteSpace: "nowrap" }}>{lead.email}</td>
                      <td style={{ padding: "11px 14px", whiteSpace: "nowrap", position: "relative" }}>
                        {/* Dynamic Email Verification Badger */}
                        {!lead.emailStatus || lead.emailStatus === "Unverified" ? (
                          <button
                            onClick={() => verifySingleEmail(lead.id, lead.email)}
                            className="verify-single-btn"
                            style={{
                              padding: "4px 10px", borderRadius: 6, border: "1.5px solid #2A2F3E",
                              background: "rgba(255,255,255,0.01)", color: "#8E9AA8", fontSize: 10, fontWeight: 700,
                              cursor: "pointer", outline: "none"
                            }}
                          >
                            🔍 Verify
                          </button>
                        ) : lead.emailStatus === "Verifying" ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#FFA502", fontWeight: 600 }}>
                            <div style={{ width: 11, height: 11, border: "1.5px solid #FFA502", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.6s linear infinite" }} />
                            <span>Verifying</span>
                          </div>
                        ) : (
                          <div style={{ display: "inline-flex", flexDirection: "column" }}>
                            <div
                              onClick={() => setMailmeteorAuditId(mailmeteorAuditId === lead.id ? null : lead.id)}
                              style={{ cursor: "pointer", display: "inline-flex", flexDirection: "column" }}
                              title="Click to view detailed Mailmeteor audit checklist"
                            >
                              {lead.emailStatus === "Deliverable" && (
                                <span style={{ background: "rgba(0,200,150,0.12)", color: "#00C896", padding: "3.5px 10px", borderRadius: 6, fontWeight: 700, fontSize: 10, display: "inline-flex", alignItems: "center", gap: 4 }}>
                                  <span style={{ fontSize: 9 }}>✔️</span> Deliverable <span style={{ fontSize: 9, opacity: 0.65 }}>☄️</span>
                                </span>
                              )}
                              {lead.emailStatus === "Catch-All" && (
                                <span style={{ background: "rgba(129,140,248,0.12)", color: "#818CF8", padding: "3.5px 10px", borderRadius: 6, fontWeight: 700, fontSize: 10, display: "inline-flex", alignItems: "center", gap: 4 }}>
                                  <span style={{ fontSize: 9 }}>👥</span> Catch-All <span style={{ fontSize: 9, opacity: 0.65 }}>☄️</span>
                                </span>
                              )}
                              {lead.emailStatus === "Risky" && (
                                <span style={{ background: "rgba(255,165,2,0.12)", color: "#FFA502", padding: "3.5px 10px", borderRadius: 6, fontWeight: 700, fontSize: 10, display: "inline-flex", alignItems: "center", gap: 4 }}>
                                  <span style={{ fontSize: 9 }}>⚠️</span> Risky <span style={{ fontSize: 9, opacity: 0.65 }}>☄️</span>
                                </span>
                              )}
                              {lead.emailStatus === "Undeliverable" && (
                                <span style={{ background: "rgba(255,71,87,0.12)", color: "#FF4757", padding: "3.5px 10px", borderRadius: 6, fontWeight: 700, fontSize: 10, display: "inline-flex", alignItems: "center", gap: 4 }}>
                                  <span style={{ fontSize: 9 }}>❌</span> Inactive <span style={{ fontSize: 9, opacity: 0.65 }}>☄️</span>
                                </span>
                              )}
                              {lead.emailDetails && (
                                <span style={{ fontSize: 9, color: "#64748B", marginTop: 2, display: "block", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {lead.emailDetails}
                                </span>
                              )}
                            </div>

                            {mailmeteorAuditId === lead.id && (
                              <div style={{
                                position: "absolute",
                                top: "100%",
                                left: 14,
                                zIndex: 100,
                                marginTop: 6,
                                background: "#0C1018",
                                border: "1px solid #1E2533",
                                borderRadius: 12,
                                padding: 12,
                                boxShadow: "0 10px 25px -5px rgba(0,0,0,0.9)",
                                minWidth: 260,
                                color: "#E2E8F0",
                                textAlign: "left",
                                fontSize: 12,
                                fontFamily: "'JetBrains Mono', monospace"
                              }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, borderBottom: "1px solid #1E2533", paddingBottom: 6 }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                    <span style={{ fontSize: 12 }}>☄️</span>
                                    <strong style={{ fontSize: 10, color: "#00C896", letterSpacing: "0.5px" }}>MAILMETEOR REPORT</strong>
                                  </div>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setMailmeteorAuditId(null);
                                    }}
                                    style={{
                                      background: "none", border: "none", color: "#64748B", cursor: "pointer", fontSize: 14, padding: "0 4px"
                                    }}
                                  >
                                    ×
                                  </button>
                                </div>
                                
                                <div style={{ display: "flex", flexDirection: "column", gap: 7, fontSize: 11 }}>
                                  {/* Format row */}
                                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                                    <span style={{ color: "#64748B" }}>Format:</span>
                                    <span>
                                      {lead.mailmeteor?.format ?? true ? "✅ Valid Syntax" : "❌ Invalid structure"}
                                    </span>
                                  </div>

                                  {/* MX records row */}
                                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                                    <span style={{ color: "#64748B" }}>MX Routing:</span>
                                    <span>
                                      {lead.mailmeteor?.mx ?? true ? "✅ DNS Valid" : "❌ No MX active"}
                                    </span>
                                  </div>

                                  {/* Disposable row */}
                                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                                    <span style={{ color: "#64748B" }}>Disposable:</span>
                                    <span>
                                      {lead.mailmeteor?.disposable ?? false ? "❌ Yes (Risky)" : "✅ No (Safe)"}
                                    </span>
                                  </div>

                                  {/* Role account row */}
                                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                                    <span style={{ color: "#64748B" }}>Role-based:</span>
                                    <span>
                                      {lead.mailmeteor?.role ?? false ? "🟡 Yes (Group list)" : "✅ No (Personal)"}
                                    </span>
                                  </div>

                                  {/* Catch-All row */}
                                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                                    <span style={{ color: "#64748B" }}>Catch-All:</span>
                                    <span>
                                      {lead.mailmeteor?.catchAll ?? (lead.emailStatus === "Catch-All") ? "👥 Yes" : "✅ No"}
                                    </span>
                                  </div>
                                </div>

                                <div style={{ marginTop: 10, borderTop: "1px solid #1E2533", paddingTop: 8, fontSize: 9, color: "#64748B", display: "flex", justifyContent: "space-between" }}>
                                  <span>STATUS:</span>
                                  <strong style={{
                                    color: lead.emailStatus === "Deliverable" ? "#00C896" :
                                           lead.emailStatus === "Catch-All" ? "#818CF8" :
                                           lead.emailStatus === "Risky" ? "#FFA502" : "#FF4757"
                                  }}>
                                    {lead.emailStatus?.toUpperCase()}
                                  </strong>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "11px 14px", color: "#94A3B8", whiteSpace: "nowrap" }}>{lead.emailStatus === "Verifying" ? "—" : lead.phone}</td>
                      <td style={{ padding: "11px 14px", color: "#94A3B8", whiteSpace: "nowrap" }}>
                        <div>{lead.location}</div>
                        <div style={{ fontSize: 10, color: "#2A2F3E" }}>{lead.country}</div>
                      </td>
                      <td style={{ padding: "11px 14px", whiteSpace: "nowrap" }}>
                        <span style={{ background: "rgba(129,140,248,0.1)", color: "#818CF8", padding: "3px 8px", borderRadius: 6, fontWeight: 600 }}>{lead.audienceType}</span>
                      </td>
                      <td style={{ padding: "11px 14px", color: "#94A3B8", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lead.occupation}</td>
                      <td style={{ padding: "11px 14px", color: "#64748B", whiteSpace: "nowrap" }}>
                        {{"WhatsApp":"💬","Instagram":"📸","Facebook":"👥","LinkedIn":"🔗","Email":"📧","SMS":"📱","TikTok":"🎵"}[lead.platform] || "📧"} {lead.platform}
                      </td>
                      <td style={{ padding: "11px 14px" }}>
                        <span style={{ background: statusBg[lead.status] || "#1E2533", color: statusColor[lead.status] || "#94A3B8", padding: "3px 10px", borderRadius: 20, fontWeight: 700, whiteSpace: "nowrap" }}>
                          {lead.status}
                        </span>
                      </td>
                      <td style={{ padding: "11px 14px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <div style={{ height: 4, width: 40, background: "#1E2533", borderRadius: 2, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${lead.score}%`, background: lead.score >= 85 ? "#00C896" : lead.score >= 70 ? "#FFA502" : "#54A0FF", borderRadius: 2 }} />
                          </div>
                          <span style={{ fontWeight: 700, color: lead.score >= 85 ? "#00C896" : lead.score >= 70 ? "#FFA502" : "#94A3B8" }}>{lead.score}</span>
                        </div>
                      </td>
                      <td style={{ padding: "11px 14px", color: "#64748B", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lead.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div style={{ padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #1E2533" }}>
              <span style={{ fontSize: 12, color: "#64748B" }}>
                Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, processedLeads.length)} of {processedLeads.length.toLocaleString()} leads
              </span>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => setPage(0)} disabled={page === 0} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #2A2F3E", background: "transparent", color: page === 0 ? "#2A2F3E" : "#94A3B8", cursor: page === 0 ? "not-allowed" : "pointer", fontSize: 12 }}>«</button>
                <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #2A2F3E", background: "transparent", color: page === 0 ? "#2A2F3E" : "#94A3B8", cursor: page === 0 ? "not-allowed" : "pointer", fontSize: 12 }}>‹ Prev</button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const p = Math.max(0, Math.min(page - 2, totalPages - 5)) + i;
                  return (
                    <button key={p} onClick={() => setPage(p)} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid", borderColor: p === page ? "#00C896" : "#2A2F3E", background: p === page ? "rgba(0,200,150,0.1)" : "transparent", color: p === page ? "#00C896" : "#94A3B8", cursor: "pointer", fontSize: 12, fontWeight: p === page ? 700 : 400 }}>{p + 1}</button>
                  );
                })}
                <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #2A2F3E", background: "transparent", color: page >= totalPages - 1 ? "#2A2F3E" : "#94A3B8", cursor: page >= totalPages - 1 ? "not-allowed" : "pointer", fontSize: 12 }}>Next ›</button>
                <button onClick={() => setPage(totalPages - 1)} disabled={page >= totalPages - 1} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #2A2F3E", background: "transparent", color: page >= totalPages - 1 ? "#2A2F3E" : "#94A3B8", cursor: page >= totalPages - 1 ? "not-allowed" : "pointer", fontSize: 12 }}>»</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}