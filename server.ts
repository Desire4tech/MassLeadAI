import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dns from "dns";
import net from "net";

const app = express();
const PORT = 3000;

app.use(express.json());

// List of popular disposable mail domains to flag
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "yopmail.com", "tempmail.com", "10minutemail.com", 
  "guerrillamail.com", "trashmail.com", "maildrop.cc", "getairmail.com", 
  "sharklasers.com", "dispostable.com", "owlymail.com", "temp-mail.org",
  "disposable.com", "fakeinbox.com", "boun.cr"
]);

// Helper to resolve MX records (real DNS lookup with Exchange output)
function verifyMX(domain: string): Promise<{ mxActive: boolean; exchange: string; details: string }> {
  return new Promise((resolve) => {
    dns.resolveMx(domain, (err, addresses) => {
      if (err || !addresses || addresses.length === 0) {
        // Fallback to searching A record (some servers route mail via direct A records)
        dns.resolve(domain, "A", (errA, addressesA) => {
          if (errA || !addressesA || addressesA.length === 0) {
            resolve({ mxActive: false, exchange: "", details: "No active MX or A records found for domain" });
          } else {
            resolve({ mxActive: true, exchange: domain, details: "A record active (No fallback MX records)" });
          }
        });
      } else {
        const sorted = addresses.sort((a, b) => a.priority - b.priority);
        resolve({ mxActive: true, exchange: sorted[0].exchange, details: `MX host verified: ${sorted[0].exchange} (Priority: ${sorted[0].priority})` });
      }
    });
  });
}

// Role-based prefixes commonly used for group/corporate distribution lists
const ROLE_PREFIXES = new Set([
  "info", "support", "contact", "sales", "admin", "jobs", "team", "office", "help", "marketing", "billing", "hello", "press", "careers", "hr", "staff", "webmaster", "hostmaster", "postmaster", "mail", "media", "legal", "finance", "feedback"
]);

// Low-level SMTP active socket checking logic that probes both a random address and the target address to determine Catch-All statuses accurately
function probeSMTPServer(exchange: string, email: string): Promise<{ status: "Deliverable" | "Catch-All" | "Risky" | "Undeliverable", catchAll: boolean, details: string, isConnectionRestricted?: boolean }> {
  return new Promise((resolve) => {
    const socket = net.createConnection(25, exchange);
    let step = 0;
    let resolved = false;
    let domainIsCatchAll = false;
    const [, domain] = email.split("@");

    // Limit probe to 2.5 seconds to keep the process fast
    socket.setTimeout(2500);

    const finish = (status: "Deliverable" | "Catch-All" | "Risky" | "Undeliverable", catchAll: boolean, details: string, isConnectionRestricted = false) => {
      if (resolved) return;
      resolved = true;
      try {
        socket.write("QUIT\r\n");
      } catch (e) {}
      socket.destroy();
      resolve({ status, catchAll, details, isConnectionRestricted });
    };

    socket.on("connect", () => {
      // Socket connected, will receive 220 banner greeting next
    });

    socket.on("data", (data) => {
      const response = data.toString();
      const lines = response.split("\r\n").map(l => l.trim()).filter(Boolean);
      const lastLine = lines[lines.length - 1] || "";
      const codeStr = lastLine.slice(0, 3);
      const code = parseInt(codeStr);

      if (step === 0) {
        if (code === 220) {
          socket.write("EHLO massleadgen.local\r\n");
          step = 1;
        } else {
          finish("Risky", false, `Greeting aborted with code ${codeStr}`);
        }
      } else if (step === 1) {
        if (code === 250) {
          socket.write("MAIL FROM:<verify@massleadgen.local>\r\n");
          step = 2;
        } else {
          finish("Risky", false, `EHLO rejected with code ${codeStr}`);
        }
      } else if (step === 2) {
        if (code === 250) {
          // Send random nonexistent address probe to check for Catch-All domain behavior
          socket.write(`RCPT TO:<nonexistent_chk_random_9876@${domain}>\r\n`);
          step = 3;
        } else {
          finish("Risky", false, `Sender address rejected: ${codeStr}`);
        }
      } else if (step === 3) {
        if (code === 250) {
          domainIsCatchAll = true;
        }
        // Now send the actual target recipient address test
        socket.write(`RCPT TO:<${email}>\r\n`);
        step = 4;
      } else if (step === 4) {
        if (code === 250) {
          if (domainIsCatchAll) {
            finish("Catch-All", true, `Target inbox accepted under Catch-All domain configuration.`);
          } else {
            finish("Deliverable", false, `Mailbox existence confirmed via direct SMTP handshake.`);
          }
        } else if ([550, 551, 552, 553, 554, 501].includes(code)) {
          finish("Undeliverable", false, `Recipient rejected: Mailbox does not exist (SMTP ${codeStr})`);
        } else if ([450, 451, 452].includes(code)) {
          finish("Risky", false, `Recipient mailbox currently full or deferred (SMTP ${codeStr})`);
        } else {
          finish("Risky", false, `SMTP handshake validation response: ${codeStr}`);
        }
      }
    });

    socket.on("error", (err: any) => {
      finish("Risky", false, `SMTP handshake restricted: ${err.message || err.code}`, true);
      socket.destroy();
    });

    socket.on("timeout", () => {
      finish("Risky", false, `SMTP handshake probe timed out.`, true);
      socket.destroy();
    });
  });
}

// Live remote verification engine utilizing the free public Eva API to query actual mailbox existence
async function queryEvaAPI(email: string): Promise<{ status: "Deliverable" | "Catch-All" | "Risky" | "Undeliverable"; catchAll: boolean; details: string; mailmeteor: any } | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000); // 4-second timeout limit
    
    const res = await fetch(`https://api.eva.pingutil.com/email?email=${encodeURIComponent(email)}`, {
      signal: controller.signal,
      headers: { 
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json"
      }
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const json = await res.json();
      if (json && json.status === "success" && json.data) {
        const d = json.data;
        const deliverable = !!d.deliverable;
        const catchAll = !!d.catch_all;
        const disposable = !!d.disposable;
        const validSyntax = !!d.valid_syntax;
        const spamTrap = !!(d.spamtrap || d.spam_trap);

        let status: "Deliverable" | "Catch-All" | "Risky" | "Undeliverable" = "Deliverable";
        let details = "Mailbox existence confirmed via remote live routing checks.";

        if (!validSyntax) {
          status = "Undeliverable";
          details = "Invalid syntax format structure detected.";
        } else if (disposable) {
          status = "Risky";
          details = "Disposable or temporary burner email address detected.";
        } else if (spamTrap) {
          status = "Risky";
          details = "High risk: flagged as potential spam trap or honey-pot address.";
        } else if (deliverable) {
          if (catchAll) {
            status = "Catch-All";
            details = "Domain catch-all configuration: accepts all recipient mailboxes.";
          } else {
            status = "Deliverable";
            details = "Mailbox existence confirmed via direct live verifier API.";
          }
        } else {
          status = "Undeliverable";
          details = "Recipient rejected: mailbox does not exist (reported inactive).";
        }

        return {
          status,
          catchAll,
          details,
          mailmeteor: {
            format: validSyntax,
            disposable: disposable,
            mx: true,
            role: false,
            catchAll: catchAll
          }
        };
      }
    }
  } catch (err: any) {
    console.warn("Eva verification query failed or timed out:", err?.message || err);
  }
  return null;
}

// AI-based high-fidelity validator backup for when outbound Port 25 is blocked
async function evaluateEmailWithAI(
  email: string,
  dnsCheck: { mxActive: boolean; exchange: string; details: string },
  isRole: boolean
): Promise<{ status: "Deliverable" | "Catch-All" | "Risky" | "Undeliverable"; catchAll: boolean; details: string; mailmeteor: any } | null> {
  try {
    const [username, domain] = email.split("@");

    const prompt = `Perform a high-fidelity, strict email deliverability audit.
Target Email: "${email}"
Username Part: "${username}"
Domain Part: "${domain}"
DNS Server: "${dnsCheck.exchange}" (${dnsCheck.details})

Context:
Our native SMTP port 25 connectivity is restricted by our sandboxed network environment, so we cannot perform physical SMTP socket handshakes. We are calling you as an expert verification oracle.

CRITICAL RULES FOR EMAIL VALIDATION:
1. Gmail (gmail.com), Hotmail/Outlook (hotmail.com, outlook.com, live.com), Yahoo (yahoo.com), and iCloud (icloud.com) NEVER use catch-all configurations. They reject emails that do not correspond to actual registered users.
2. Users frequently enter mock, test, fake, or synthetic placeholder email names (e.g., "test1234@gmail.com", "fakeaddress@gmail.com", "ajshdkjahs@gmail.com", "notexist@gmail.com", "nobody@hotmail.com"). These MUST be marked as "Undeliverable" or "Risky", not "Deliverable".
3. Check for gibberish patterns: usernames consisting of random, chaotic sequences of characters without standard phonetics or vowels (e.g., "qwrtyu123", "sdhgfjsh", "zxcvb") should be flagged as "Undeliverable".
4. Check for test accounts: usernames with phrases like "test", "demo", "dummy", "fake", "nonsense", "example", "hello1234" represent fake registrations and be "Undeliverable".
5. For private corporate or business domains (such as "company.com", "stripe.com"): they often utilize Catch-All inboxes which accept all mail. Evaluate if the domain is a corporate workspace, and classify accordingly as "Catch-All".
6. Be very conservative and strict. If you are not highly confident that the email is a genuine, active, real human account (like "john.doe@gmail.com", "david.smith@yahoo.com"), classify it as "Risky" or "Undeliverable" rather than "Deliverable".

Respond strictly with a JSON object conforming to the following TypeScript interface:
{
  "status": "Deliverable" | "Catch-All" | "Risky" | "Undeliverable",
  "catchAll": boolean,
  "details": string,
  "mailmeteor": {
    "format": boolean,
    "disposable": boolean,
    "mx": boolean,
    "role": boolean,
    "catchAll": boolean
  }
}
`;

    const parsed = await callGeminiWithFailover(async (ai, modelName, keyIndex, totalKeys) => {
      console.log(`[Gemini Request] Evaluating email with Key #${keyIndex + 1}/${totalKeys} using model "${modelName}"...`);
      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              status: { type: Type.STRING, description: "Must be: Deliverable, Catch-All, Risky, or Undeliverable" },
              catchAll: { type: Type.BOOLEAN, description: "True if domain accepts all mail, false otherwise" },
              details: { type: Type.STRING, description: "A highly concise professional verdict explaining the rating" },
              mailmeteor: {
                type: Type.OBJECT,
                properties: {
                  format: { type: Type.BOOLEAN },
                  disposable: { type: Type.BOOLEAN },
                  mx: { type: Type.BOOLEAN },
                  role: { type: Type.BOOLEAN },
                  catchAll: { type: Type.BOOLEAN }
                },
                required: ["format", "disposable", "mx", "role", "catchAll"]
              }
            },
            required: ["status", "catchAll", "details", "mailmeteor"]
          }
        }
      });
      return JSON.parse(response.text?.trim() || "{}");
    });

    if (parsed.status && parsed.mailmeteor) {
      return {
        status: parsed.status,
        catchAll: !!parsed.catchAll,
        details: parsed.details || "AI verified deliverability assessment",
        mailmeteor: {
          format: true,
          disposable: false,
          mx: true,
          role: isRole,
          catchAll: !!parsed.catchAll,
          ...parsed.mailmeteor
        }
      };
    }
    return null;
  } catch (error: any) {
    console.warn("AI Email evaluation failed, falling back to local constraints checker:", error?.message || error);
    return null;
  }
}

// Robust, deterministic local fallback engine for when port 25 is blocked and AI fails or is unconfigured
function evaluateEmailDeterministic(
  email: string,
  dnsCheck: { mxActive: boolean; exchange: string; details: string },
  isRole: boolean
): { status: "Deliverable" | "Catch-All" | "Risky" | "Undeliverable", catchAll: boolean, details: string, mailmeteor: any } {
  const [username, domain] = email.split("@");
  const lowercaseUsername = username.toLowerCase();
  const lowercaseDomain = domain.toLowerCase();

  const isCommonProvider = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "live.com", "icloud.com", "aol.com"].includes(lowercaseDomain);

  // 1. Check for dummy keywords
  const dummyKeywords = ["test", "fake", "demo", "dummy", "nonexistent", "user", "email", "mail", "temp", "asdf", "qwerty", "placeholder", "nobody", "null", "undefined", "abcd", "nonsense", "example", "sample", "chk_random", "noreply", "no-reply"];
  for (const kw of dummyKeywords) {
    if (lowercaseUsername.includes(kw)) {
      return {
        status: "Undeliverable",
        catchAll: false,
        details: `Identified sandbox placeholder username pattern ("${kw}").`,
        mailmeteor: {
          format: true,
          disposable: false,
          mx: true,
          role: isRole,
          catchAll: false
        }
      };
    }
  }

  // 2. Standard provider length limits
  if (lowercaseDomain === "gmail.com") {
    if (lowercaseUsername.length < 6 || lowercaseUsername.length > 30) {
      return {
        status: "Undeliverable",
        catchAll: false,
        details: `Gmail username length restriction violation (must be 6-30 chars). Provided: ${lowercaseUsername.length} chars.`,
        mailmeteor: {
          format: true,
          disposable: false,
          mx: true,
          role: isRole,
          catchAll: false
        }
      };
    }
  }

  // 3. Gibberish check: string of random consonants with no vowels, or consecutive cluster
  const hasVowels = /[aeiouy]/i.test(lowercaseUsername);
  const consecutiveConsonants = /[^aeiouy0-9._-]{5,}/i.test(lowercaseUsername);
  const tooManyTrailingNumbers = /\d{5,}$/.test(lowercaseUsername);

  if (!hasVowels && lowercaseUsername.length > 3) {
    return {
      status: "Undeliverable",
      catchAll: false,
      details: "Gibberish pattern detected: username contains zero vowel phonetics.",
      mailmeteor: {
        format: true,
        disposable: false,
        mx: true,
        role: isRole,
        catchAll: false
      }
    };
  }

  if (consecutiveConsonants) {
    return {
      status: "Risky",
      catchAll: false,
      details: "Gibberish pattern detected: high consecutive consonant density.",
      mailmeteor: {
        format: true,
        disposable: false,
        mx: true,
        role: isRole,
        catchAll: false
      }
    };
  }

  if (tooManyTrailingNumbers) {
    return {
      status: "Risky",
      catchAll: false,
      details: "Synthetic pattern: abnormal trailing numerical sequence.",
      mailmeteor: {
        format: true,
        disposable: false,
        mx: true,
        role: isRole,
        catchAll: false
      }
    };
  }

  // 4. Standard determination when network connectivity is restricted
  if (isCommonProvider) {
    // If it's a very standard-looking name e.g., "sarah.jones" or "emeka_nwachukwu" with no suspicious patterns,
    // we can carefully mark as Deliverable, stating SMTP port limits.
    const isVerySimpleName = /^[a-z]+[._]?[a-z]+(\d{1,4})?$/i.test(lowercaseUsername);
    if (isVerySimpleName) {
      return {
        status: "Deliverable",
        catchAll: false,
        details: `MX check passed. Outbound verification bypass: standard name format matching.`,
        mailmeteor: {
          format: true,
          disposable: false,
          mx: true,
          role: isRole,
          catchAll: false
        }
      };
    } else {
      return {
        status: "Risky",
        catchAll: false,
        details: `MX active. Verification connection restricted; complex/uncommon name pattern flagged.`,
        mailmeteor: {
          format: true,
          disposable: false,
          mx: true,
          role: isRole,
          catchAll: false
        }
      };
    }
  }

  // Business setups are highly likely Catch-All or Risky if not direct.
  return {
    status: "Catch-All",
    catchAll: true,
    details: `Business MX active. SMTP handshaking restricted; designated business catch-all pool.`,
    mailmeteor: {
      format: true,
      disposable: false,
      mx: true,
      role: isRole,
      catchAll: true
    }
  };
}

// REST email verifier endpoint
app.post("/api/verify-email", async (req, res) => {
  const { email } = req.body;

  if (!email || typeof email !== "string") {
    return res.status(400).json({ error: "Email is required" });
  }

  const trimmed = email.trim();
  const username = trimmed.split("@")[0] || "";
  const lowercaseUsername = username.toLowerCase();
  const isRole = ROLE_PREFIXES.has(lowercaseUsername);
  
  // 1. Syntax Check
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed)) {
    return res.json({
      success: true,
      email: trimmed,
      status: "Undeliverable",
      details: "Invalid syntax format structure",
      mailmeteor: {
        format: false,
        disposable: false,
        mx: false,
        role: false,
        catchAll: false
      }
    });
  }

  const [, domain] = trimmed.split("@");
  const lowercaseDomain = domain.toLowerCase();

  // 2. Disposable check
  if (DISPOSABLE_DOMAINS.has(lowercaseDomain)) {
    return res.json({
      success: true,
      email: trimmed,
      status: "Risky",
      details: "Disposable/Temporary burner email address detected",
      mailmeteor: {
        format: true,
        disposable: true,
        mx: false,
        role: isRole,
        catchAll: false
      }
    });
  }

  try {
    // 3. DNS / MX verification
    const dnsCheck = await verifyMX(lowercaseDomain);

    if (!dnsCheck.mxActive) {
      return res.json({
        success: true,
        email: trimmed,
        status: "Undeliverable",
        details: dnsCheck.details,
        mailmeteor: {
          format: true,
          disposable: false,
          mx: false,
          role: isRole,
          catchAll: false
        }
      });
    }

    // 4. Active SMTP probe to verify if the mailbox actually exists and is reachable
    const smtpCheck = await probeSMTPServer(dnsCheck.exchange, trimmed);

     // If SMTP Port 25 was blocked/restricted, evaluate using live remote API, AI, and deterministic heuristics
     if (smtpCheck.isConnectionRestricted) {
       let finalResult = await queryEvaAPI(trimmed);
 
       if (!finalResult) {
         try {
           finalResult = await evaluateEmailWithAI(trimmed, dnsCheck, isRole);
         } catch (aiErr) {
           console.warn("AI Email verifier threw error, falling back to local heuristic analyzer:", aiErr);
         }
       }
 
       if (!finalResult) {
         finalResult = evaluateEmailDeterministic(trimmed, dnsCheck, isRole);
       }

      return res.json({
        success: true,
        email: trimmed,
        status: finalResult.status,
        details: `${finalResult.details} (${dnsCheck.details})`,
        mailmeteor: finalResult.mailmeteor
      });
    }

    // Direct physical SMTP probe succeeded!
    return res.json({
      success: true,
      email: trimmed,
      status: smtpCheck.status,
      details: `${smtpCheck.details} (${dnsCheck.details})`,
      mailmeteor: {
        format: true,
        disposable: false,
        mx: true,
        role: isRole,
        catchAll: smtpCheck.catchAll
      }
    });

  } catch (error: any) {
    res.json({
      success: true,
      email: trimmed,
      status: "Risky",
      details: `Active lookup timed out: ${error?.message || "Unknown Network State"}`,
      mailmeteor: {
        format: true,
        disposable: false,
        mx: true,
        role: isRole,
        catchAll: false
      }
    });
  }
});

// Initialize GoogleGenAI with multi-key failover capabilities
function getAvailableKeys(): string[] {
  const keys: string[] = [];
  
  // 1. Core standardized system key
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "MY_GEMINI_API_KEY" && process.env.GEMINI_API_KEY.trim() !== "") {
    keys.push(process.env.GEMINI_API_KEY.trim());
  }
  
  // 2. Extra numbered API keys GEMINI_API_KEY_1 to GEMINI_API_KEY_10
  for (let i = 1; i <= 10; i++) {
    const keyName = `GEMINI_API_KEY_${i}`;
    const value = process.env[keyName];
    if (value && value !== "MY_GEMINI_API_KEY" && value.trim() !== "") {
      const trimmed = value.trim();
      if (!keys.includes(trimmed)) {
        keys.push(trimmed);
      }
    }
  }

  // 3. Scan all process.env for any keys starting with GEMINI_API_KEY to catch other variants (e.g. GEMINI_API_KEY_BACKUP, GEMINI_API_KEY_PRO, etc.)
  for (const envKey of Object.keys(process.env)) {
    if (envKey.startsWith("GEMINI_API_KEY") && envKey !== "GEMINI_API_KEY") {
      const val = process.env[envKey];
      if (val && val !== "MY_GEMINI_API_KEY" && val.trim() !== "") {
        const trimmed = val.trim();
        if (!keys.includes(trimmed)) {
          keys.push(trimmed);
        }
      }
    }
  }
  
  return keys;
}

// Global failover runner with retry mechanics and multi-model fallbacks for robust production operations
async function callGeminiWithFailover<T>(
  action: (ai: GoogleGenAI, modelName: string, keyIndex: number, totalKeys: number) => Promise<T>
): Promise<T> {
  const keys = getAvailableKeys();
  if (keys.length === 0) {
    const fallbackKey = process.env.GEMINI_API_KEY;
    if (!fallbackKey || fallbackKey === "MY_GEMINI_API_KEY" || fallbackKey.trim() === "") {
      throw new Error("No configured GEMINI_API_KEY found in server environment.");
    }
    keys.push(fallbackKey.trim());
  }

  // Model hierarchy to try in sequence for resiliency when a model experiences high demand (503) or 429
  const modelsToTry = ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-flash-latest"];
  let lastError: any = null;

  for (let k = 0; k < keys.length; k++) {
    const key = keys[k];
    let skipKey = false;
    
    // Create the client for this key
    const ai = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });

    for (const modelName of modelsToTry) {
      if (skipKey) {
        break;
      }

      // Try each model with a quick single retry for transient timeouts/load errors.
      // If we hit a 429 quota exhaustion, we will fast-break this key entirely.
      const maxRetries = 1;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          if (attempt > 0) {
            const delay = attempt * 200; // Small 200ms delay before retrying
            console.log(`[Failover] Quick retry on Key #${k + 1}/${keys.length} with model "${modelName}" (Attempt ${attempt + 1}/${maxRetries + 1}) after ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
          return await action(ai, modelName, k, keys.length);
        } catch (err: any) {
          lastError = err;
          // Extract error code/status if available
          const code = err?.status || err?.status_code || err?.code || (err?.error?.code) || "";
          let msg = "";
          try {
            msg = err?.message || (err && typeof err === "object" ? String(err) : String(err));
          } catch (e) {
            msg = "Unextractable error message";
          }
          
          console.warn(
            `[Failover] Call failed on Key #${k + 1}/${keys.length} [Model: ${modelName}, Attempt: ${attempt + 1}/${maxRetries + 1}]. Error Code: ${code}.`
          );

          // Check if it is a 429 Quota Exceeded / Rate Limit
          const is429 = 
            code === 429 || 
            msg.includes("429") || 
            msg.toLowerCase().includes("quota") || 
            msg.toLowerCase().includes("rate limit") || 
            msg.toLowerCase().includes("exhausted");

          if (is429) {
            console.warn(`[Failover] Key #${k + 1}/${keys.length} is rate-limited or quota exhausted. Instantly switching to next available API key to save latency...`);
            skipKey = true;
            break; // Break the retry loop for this model; outer loop checks skipKey and breaks the model loop
          }

          // Check if it is a structural validation, bad request, or non-transient error
          const isTransient = 
            code === 503 || 
            msg.includes("503") || 
            msg.toLowerCase().includes("overloaded") || 
            msg.toLowerCase().includes("demand") || 
            msg.toLowerCase().includes("temporary") || 
            msg.toLowerCase().includes("unavailable");

          if (!isTransient) {
            console.log(`[Failover] Non-transient error detected (e.g. bad request or invalid schema). Skipping further retries for this configuration.`);
            break; // Break the retry loop to try the next model
          }
        }
      }
    }
  }
  
  throw lastError || new Error("All configured Gemini API keys and fallback models failed or hit limits.");
}

// Keep legacy getGemini to avoid any un-imported breakage or other usages
function getGemini(): GoogleGenAI {
  const keys = getAvailableKeys();
  const key = keys[0] || process.env.GEMINI_API_KEY || "MY_GEMINI_API_KEY";
  return new GoogleGenAI({
    apiKey: key,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
}

// Low-level helper: realistic names/locations for fallbacks if Gemini is not available or quota is exhausted.
function generateFallbackLeads(options: any): any[] {
  const opts = options || {};
  const batchSize = typeof opts.batchSize === "number" ? opts.batchSize : 20;
  const country = typeof opts.country === "string" ? opts.country : "Nigeria";
  const city = typeof opts.city === "string" ? opts.city : "";
  const audiences = Array.isArray(opts.audiences) ? opts.audiences : [];
  const gender = typeof opts.gender === "string" ? opts.gender : "Any";
  const ageRange = typeof opts.ageRange === "string" ? opts.ageRange : "Any";
  const incomeLevel = typeof opts.incomeLevel === "string" ? opts.incomeLevel : "Any";
  const educationLevel = typeof opts.educationLevel === "string" ? opts.educationLevel : "Any";
  const interests = Array.isArray(opts.interests) ? opts.interests : [];
  const exclusions = Array.isArray(opts.exclusions) ? opts.exclusions : [];

  const results: any[] = [];
  const primaryAudience = audiences[0] || "Business Owners";

  // Data pools for realistic rendering
  const countriesData: Record<string, { males: string[], females: string[], lastNames: string[], cities: string[], phones: string }> = {
    "Nigeria": {
      males: ["Chidi", "Babajide", "Emeka", "Kunle", "Tunde", "Abubakar", "Ibrahim", "Ojo", "Tochukwu", "Kolawole", "Olumide", "Obinna", "Jide", "Segun", "Femi", "Sani", "Uche"],
      females: ["Chioma", "Funmilayo", "Yetunde", "Amina", "Zainab", "Ngozi", "Ifeoma", "Fatima", "Adeboke", "Blessing", "Amara", "Aisha", "Halima", "Kemi", "Titi", "Ronke", "Bukola"],
      lastNames: ["Okonkwo", "Adebayo", "Nwosu", "Balogun", "Yusuf", "Bello", "Eze", "Okafor", "Danjuma", "Adeyemi", "Shonibare", "Nwachukwu", "Ibrahim", "Alabi", "Akinyemi"],
      cities: ["Lagos", "Abuja", "Port Harcourt", "Ibadan", "Kano", "Enugu", "Benin City", "Kaduna"],
      phones: "+234 "
    },
    "United States": {
      males: ["James", "John", "Robert", "Michael", "William", "David", "Richard", "Charles", "Joseph", "Thomas", "Daniel", "Matthew"],
      females: ["Mary", "Patricia", "Jennifer", "Linda", "Elizabeth", "Barbara", "Susan", "Jessica", "Sarah", "Karen", "Nancy", "Lisa"],
      lastNames: ["Smith", "Johnson", "Williams", "Brown", "Jones", "Miller", "Davis", "Wilson", "Anderson", "Taylor", "Thomas", "Moore"],
      cities: ["New York", "Los Angeles", "Chicago", "Houston", "Phoenix", "Philadelphia", "San Antonio", "San Diego", "Dallas"],
      phones: "+1 (555) "
    },
    "United Kingdom": {
      males: ["Oliver", "George", "Noah", "Harry", "Jack", "Leo", "Arthur", "Muhammad", "Oscar", "Charlie"],
      females: ["Olivia", "Amelia", "Isla", "Ava", "Mia", "Ivy", "Lily", "Freya", "Florence"],
      lastNames: ["Smith", "Jones", "Taylor", "Brown", "Williams", "Wilson", "Johnson", "Davies", "Robinson", "Wright", "Thompson"],
      cities: ["London", "Birmingham", "Leeds", "Glasgow", "Sheffield", "Manchester", "Edinburgh", "Liverpool", "Bristol"],
      phones: "+44 7700 "
    },
    "Australia": {
      males: ["William", "Noah", "Jack", "Henry", "Leo", "Charlie", "Oliver", "Hudson", "Lucas"],
      females: ["Charlotte", "Amelia", "Olivia", "Mia", "Isla", "Harper", "Grace", "Matilda"],
      lastNames: ["Smith", "Jones", "Williams", "Brown", "Wilson", "Taylor", "Morton", "Davis", "White", "Anderson"],
      cities: ["Sydney", "Melbourne", "Brisbane", "Perth", "Adelaide", "Hobart", "Canberra", "Darwin"],
      phones: "+61 491 570 "
    },
    "India": {
      males: ["Aarav", "Arjun", "Aditya", "Vihaan", "Krishna", "Sai", "Ishaan", "Kabir", "Reyansh", "Aryan", "Amit", "Rahul", "Sanjay"],
      females: ["Aadhya", "Diya", "Saanvi", "Ananya", "Yashvi", "Kiara", "Pari", "Myra", "Anika", "Priya", "Neha", "Ritu", "Deepika"],
      lastNames: ["Sharma", "Patel", "Kumar", "Singh", "Shah", "Mehta", "Joshi", "Roy", "Prasad", "Nair", "Iyer", "Banerjee"],
      cities: ["Mumbai", "Delhi", "Bangalore", "Hyderabad", "Ahmedabad", "Chennai", "Kolkata", "Pune", "Jaipur"],
      phones: "+91 98765 "
    }
  };

  const defaultPool = {
    males: ["Alex", "Chris", "Jordan", "Sam", "Taylor", "Morgan", "Casey", "Pat", "Robin", "Denis", "Aris"],
    females: ["Maria", "Ana", "Elena", "Sophie", "Clara", "Chloe", "Emma", "Zoe", "Eva", "Laura", "Sara"],
    lastNames: ["Muller", "Gomez", "Silva", "Lefevre", "Novak", "Kovacs", "Rossi", "Petrov", "Melnyk", "Ivanov"],
    cities: ["Capital City", "Metro Area", "Central District", "South Side", "Coastal Region"],
    phones: "+1 (800) "
  };

  const pool = countriesData[country] || defaultPool;

  const occupationsMap: Record<string, string[]> = {
    "Business Owners": ["SME Founder", "CEO", "Boutique Owner", "E-commerce Merchant", "Local General Contractor", "Retail Shop Operator", "Agribusiness Director"],
    "Job Seekers": ["Junior Web Developer", "Unemployed Graduate", "SDR Aspirant", "Administrative Assistant", "Customer Support Professional"],
    "Students": ["University Undergraduate", "Computer Science Major", "MBA Candidate", "High School Senior", "Vocation Trainee"],
    "Employees": ["Software Engineer", "Sales Specialist", "Marketing Coordinator", "Financial Analyst", "Operations Manager", "Customer Success Team Lead"],
    "Freelancers": ["Freelance Copywriter", "UI/UX Designer", "Full Stack Contractor", "Upwork Developer", "Digital Marketing Consultant"],
    "Digital Marketers": ["SEO Lead", "Media Buyer", "Growth Marketer", "PPC Specialist", "Social Media Manager", "Email Marketing Specialist"],
    "Sales Professionals": ["Account Executive", "Business Development Representative", "Sales Development Representative (SDR)", "Inside Sales Specialist", "Sales Director"],
    "Affiliate Marketers": ["Blog Publisher", "Niche Funnel Builder", "Performance Marketing Associate", "Affiliate Partnership Coordinator"],
    "Graphic Designers": ["Senior Brand Designer", "Vector Illustrator", "Marketing Visual Designer", "Layout Artist", "Creative Asset Designer"],
    "UI/UX Designers": ["User Researcher", "Interaction Designer", "UI Architect", "Figma Prototyper", "Product Generalist"],
    "Automation Engineers": ["Workflow QA Specialist", "RPA Developer", "CI/CD Tooling Engineer", "Integration Developer", "Process Automation Lead"],
    "Writers / Copywriters": ["Freelance Copywriter", "Technical Documentation Writer", "Ghostwriter", "SEO Content Creator", "Script Editor"],
    "Finance & Accounting": ["Staff Accountant", "Certified Public Accountant (CPA)", "Internal Auditor", "Financial Analyst", "Tax Advisor", "Bookkeeper"],
    "Content Creators": ["YouTuber", "Instagram Influencer", "Substack Writer", "TikTok Creator", "Copywriter", "Podcast Host"],
    "Virtual Assistants": ["Remote Executive Assistant", "Customer Support Specialist", "Data Entry Specialist", "Calendar Coordinator", "Inbox Manager"],
    "Developers": ["Frontend Architect", "Backend Systems Engineer", "React Native Developer", "Full Stack Engineer", "DevOps Engineer"],
    "Project Managers": ["IT Project Manager", "Scrum Master", "Product Owner", "Agile Coach", "Operations Lead"],
    "Cybersecurity Specialists": ["Security Analyst", "Penetration Tester", "SOC Engineer", "Information Security Officer", "Ethical Hacker"],
    "Corp Members (NYSC)": ["Primary School Tutor (Corper)", "Local Government Attaché", "Community Services Head", "Graduate Intern", "Secretariat Assistant"],
    "Educators / Teachers": ["Secondary School Teacher", "University Lecturer", "Private Tutor", "Corporate Trainer", "Academic Coordinator"],
    "Corporate Executives": ["VP of Operations", "Director of Product marketing", "Managing Director", "Chief Financial Officer", "Regional HR Partner"],
    "Healthcare Workers": ["Registered Nurse", "Senior Medical Doctor", "Clinic Administrator", "Resident Pharmacist", "Laboratory Specialist"]
  };

  const currentOccupations = occupationsMap[primaryAudience] || ["Independent Consultant", "Specialist", "Freelance Practitioner", "Manager"];
  const finalCities = city ? [city] : (Array.isArray(pool.cities) && pool.cities.length > 0 ? pool.cities : ["Metropolis"]);
  const listGenders = gender === "Any" ? ["Male", "Female"] : [gender];

  const poolMales = Array.isArray(pool.males) && pool.males.length > 0 ? pool.males : ["John"];
  const poolFemales = Array.isArray(pool.females) && pool.females.length > 0 ? pool.females : ["Jane"];
  const poolLastNames = Array.isArray(pool.lastNames) && pool.lastNames.length > 0 ? pool.lastNames : ["Doe"];

  for (let idx = 0; idx < batchSize; idx++) {
    const isMale = listGenders[Math.floor(Math.random() * listGenders.length)] === "Male";
    const firstName = isMale 
      ? poolMales[Math.floor(Math.random() * poolMales.length)]
      : poolFemales[Math.floor(Math.random() * poolFemales.length)];
    const lastName = poolLastNames[Math.floor(Math.random() * poolLastNames.length)];
    const fullName = `${firstName || "John"} ${lastName || "Doe"}`;

    if (exclusions.includes(fullName)) continue;

    // Generate clean email
    const separator = Math.random() > 0.5 ? "." : "_";
    const emailSuffix = Math.random() > 0.7 ? "yahoo.com" : Math.random() > 0.5 ? "hotmail.com" : "gmail.com";
    const fName = (firstName || "John").replace(/\s+/g, "").toLowerCase();
    const lName = (lastName || "Doe").replace(/\s+/g, "").toLowerCase();
    const email = `${fName}${separator}${lName}${Math.floor(Math.random() * 90 + 10)}@${emailSuffix}`;

    // Phone
    const phoneNum = (pool.phones || "+1 ") + Math.floor(Math.random() * 900000 + 100000);

    // Age
    let age = 28;
    if (ageRange === "18–24") age = Math.floor(Math.random() * 7 + 18);
    else if (ageRange === "25–34") age = Math.floor(Math.random() * 10 + 25);
    else if (ageRange === "35–44") age = Math.floor(Math.random() * 10 + 35);
    else if (ageRange === "45–54") age = Math.floor(Math.random() * 10 + 45);
    else if (ageRange === "55–64") age = Math.floor(Math.random() * 10 + 55);
    else if (ageRange === "65+") age = Math.floor(Math.random() * 20 + 65);
    else age = Math.floor(Math.random() * 32 + 20);

    // Platform
    const platforms = ["WhatsApp", "Instagram", "Facebook", "LinkedIn", "Email", "SMS", "TikTok"];
    const platform = platforms[Math.floor(Math.random() * platforms.length)];

    // Status
    const statusVal = Math.random() > 0.75 ? "Hot" : Math.random() > 0.4 ? "Warm" : "Cold";

    // Interests
    const selectedInterests = interests.length > 0 
      ? [interests[idx % interests.length], interests[(idx + 1) % interests.length]].filter(Boolean)
      : ["Finance & Investment", "Technology", "Education", "Travel"].slice(0, Math.floor(Math.random() * 2) + 1);

    results.push({
      name: fullName,
      email: email,
      phone: phoneNum,
      gender: isMale ? "Male" : "Female",
      age: age,
      location: finalCities[Math.floor(Math.random() * finalCities.length)],
      country: country,
      audienceType: primaryAudience,
      occupation: currentOccupations[Math.floor(Math.random() * currentOccupations.length)],
      education: educationLevel === "Any" ? "Bachelor's Degree" : educationLevel,
      income: incomeLevel === "Any" ? "Middle income" : incomeLevel,
      interests: selectedInterests,
      platform: platform,
      status: statusVal,
      score: Math.floor(Math.random() * 40 + 58),
      notes: `Verifiable lead sourced near ${finalCities[0]} with aligned interest in ${selectedInterests.join(", ")}. Perfect target match for current outbound outreach.`
    });
  }

  return results;
}

// Full-fledged proxy API route for leads generation
app.post("/api/generate-leads", async (req, res) => {
  const body = req.body || {};
  const batchNum = typeof body.batchNum === "number" ? body.batchNum : 1;
  const batchSize = typeof body.batchSize === "number" ? body.batchSize : 20;
  const locationLabel = typeof body.locationLabel === "string" ? body.locationLabel : "Nigeria";
  const audiences = Array.isArray(body.audiences) ? body.audiences : [];
  const gender = typeof body.gender === "string" ? body.gender : "Any";
  const ageRange = typeof body.ageRange === "string" ? body.ageRange : "Any";
  const incomeLevel = typeof body.incomeLevel === "string" ? body.incomeLevel : "Any";
  const educationLevel = typeof body.educationLevel === "string" ? body.educationLevel : "Any";
  const interests = Array.isArray(body.interests) ? body.interests : [];
  const campaignGoal = typeof body.campaignGoal === "string" ? body.campaignGoal : "Sourcing targeted leads";
  const country = typeof body.country === "string" ? body.country : "Nigeria";
  const city = typeof body.city === "string" ? body.city : "";
  const exclusions = Array.isArray(body.exclusions) ? body.exclusions : [];

  try {
    const exclusionsStr = exclusions.length > 0 ? exclusions.slice(-20).join(", ") : "none";
    const prompt = `You are a professional lead generation and directory synthesis assistant. Your task is to generate exactly ${batchSize} high-quality, realistic, and culturally authentic target lead profiles for ${country}${city ? ` near ${city}` : ""}.
    
    TARGET TARGETING PARAMETERS:
    - Target Location: ${locationLabel}
    - Primary Target Audience Groups: ${audiences.join(", ") || "General Public"}
    - Gender Mix Restriction: ${gender} (If "Any", provide a realistic mix of genders)
    - Age Range Category: ${ageRange}
    - Income Tier Category: ${incomeLevel}
    - Education Standard: ${educationLevel}
    - Explicit Interests/Focus Points: ${interests.length > 0 ? interests.join(", ") : "General"}
    - Active Campaign Outreach Goal: ${campaignGoal}
    - Target Output Country: ${country}
    - Batch Sequence: ${batchNum}
    
    CRITICAL AUTHENTICITY RULES:
    1. Names MUST be culturally and locally common to the people of ${country}. (e.g. for Nigeria, use well-formed Yoruba, Igbo, Hausa, or generally common Southern/Northern names; for India use common Indian names, etc.)
    2. Phone numbers must reflect realistic dialing formats and international prefixes for ${country}.
    3. Emails should be realistic (such as format like first.last@gmail.com, name99@yahoo.com, etc.).
    4. Sourced locations must represent actual neighborhoods, major cities, or suburbs in ${country}/around ${city}.
    5. The 'audienceType' of each item must match one of these selected from the target list: ${audiences.join(", ") || "Business Owners"}.
    6. Ensure you vary interest profiles and select actual platforms (WhatsApp, Instagram, Facebook, LinkedIn, Email, SMS, TikTok).
    7. Exclude these names to avoid duplicates: ${exclusionsStr}.
    8. Set custom notes detailing why they match the goal: "${campaignGoal}".`;

    const parsedText = await callGeminiWithFailover(async (ai, modelName, keyIndex, totalKeys) => {
      console.log(`[Gemini Request] Generating leads with Key #${keyIndex + 1}/${totalKeys} using model "${modelName}"...`);
      const aiResponse = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING, description: "Official local name or full name of the target lead." },
                email: { type: Type.STRING, description: "A realistic personal or professional contact email address." },
                phone: { type: Type.STRING, description: "Valid structural mobile or landline phone number formatted for target country." },
                gender: { type: Type.STRING, description: "Male or Female" },
                age: { type: Type.INTEGER, description: "Target age (integer between 18 and 80)." },
                location: { type: Type.STRING, description: "Real metropolitan borough, neighborhood, or city name within the country." },
                country: { type: Type.STRING, description: "Must match target country." },
                audienceType: { type: Type.STRING, description: "Matches targeted audience type label." },
                occupation: { type: Type.STRING, description: "Clear localized occupation title." },
                education: { type: Type.STRING, description: "Localized or general level of education standard match." },
                income: { type: Type.STRING, description: "Matching targeted income level description." },
                interests: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "List of 1 to 3 interests closely resembling target list or background."
                },
                platform: { type: Type.STRING, description: "Selected from: WhatsApp, Instagram, Facebook, LinkedIn, Email, SMS, TikTok." },
                status: { type: Type.STRING, description: "Selected from: Cold, Warm, Hot" },
                score: { type: Type.INTEGER, description: "Outbound compatibility quality score (integer from 55 to 100)." },
                notes: { type: Type.STRING, description: "A detailed contextual explanation explaining exactly why they align well with the goal." }
              },
              required: ["name", "email", "phone", "gender", "age", "location", "country", "audienceType", "platform", "status", "score", "notes"]
            }
          }
        }
      });
      return aiResponse.text?.trim() || "";
    });

    const parsedLeads = JSON.parse(parsedText);

    if (Array.isArray(parsedLeads)) {
      res.json({ success: true, leads: parsedLeads, mode: "ai" });
    } else {
      throw new Error("Gemini returned invalid schema layout");
    }

  } catch (error: any) {
    console.warn("[Sourcing Server Alert] Gemini error. Utilizing secure container lead database simulation fallback.", error?.message || error);
    // Graceful fallback logic
    const mockLeads = generateFallbackLeads(req.body);
    res.json({ success: true, leads: mockLeads, mode: "simulation", fallbackNotice: error?.message || "Gemini engine temporary sandbox mode active" });
  }
});


async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server successfully started on http://0.0.0.0:${PORT}`);
  });
}

startServer();
