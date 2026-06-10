export interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string;
  gender: string;
  age: number;
  location: string;
  country: string;
  audienceType: string;
  occupation: string;
  education: string;
  income: string;
  interests: string[];
  platform: string;
  status: "Cold" | "Warm" | "Hot";
  score: number;
  notes: string;
  batchNum: number;
  emailStatus?: "Unverified" | "Verifying" | "Deliverable" | "Risky" | "Undeliverable" | "Catch-All";
  emailDetails?: string;
  mailmeteor?: {
    format: boolean;
    disposable: boolean;
    mx: boolean;
    role: boolean;
    catchAll: boolean;
  };
}
