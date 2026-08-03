export type UserRole = "boss" | "employee";
export type ServicePlan = "weekly" | "biweekly" | "monthly" | "one_time";
export type InvoiceStatus = "unpaid" | "paid" | "overdue";
export type RecurrenceType = "one_time" | "weekly" | "biweekly" | "custom";
export type TimeOffStatus = "pending" | "approved" | "denied";
export type JobStatus = "scheduled" | "in_progress" | "done" | "skipped";

export interface Profile {
  id: string;
  full_name: string;
  role: UserRole;
  phone: string | null;
  is_active: boolean;
  /** bcrypt hash of the employee's 4-digit view code; null until they set one */
  pin_hash?: string | null;
  created_at: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  plan: ServicePlan;
  price: number | null;
  last_service_date: string | null;
  notes: string | null;
  card_brand: string | null;
  card_last4: string | null;
  card_exp: string | null;
  contract_file_url: string | null;
  created_at: string;
}

export interface Invoice {
  id: string;
  customer_id: string;
  description: string;
  amount: number;
  status: InvoiceStatus;
  issue_date: string;
  due_date: string;
  paid_date: string | null;
  recurrence: RecurrenceType;
  created_by: string | null;
  created_at: string;
  customers?: { name: string } | null;
}

export interface CrewShift {
  id: string;
  employee_id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  note: string | null;
  created_at: string;
  profiles?: { full_name: string } | null;
}

export interface ScheduledJob {
  id: string;
  customer_id: string;
  employee_id: string | null;
  job_date: string;
  recurrence: RecurrenceType;
  status: JobStatus;
  note: string | null;
  created_at: string;
  customers?: { name: string; address: string | null; plan: ServicePlan } | null;
  profiles?: { full_name: string } | null;
}

export interface TimeClockEntry {
  id: string;
  employee_id: string;
  clock_in: string;
  clock_out: string | null;
  created_at: string;
  profiles?: { full_name: string } | null;
}

export interface JobTimerEntry {
  id: string;
  employee_id: string;
  job_name: string;
  started_at: string;
  ended_at: string | null;
  created_at: string;
  profiles?: { full_name: string } | null;
}

export interface TimeOffRequest {
  id: string;
  employee_id: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  status: TimeOffStatus;
  reviewed_by: string | null;
  created_at: string;
  profiles?: { full_name: string } | null;
}

export interface Todo {
  id: string;
  employee_id: string | null;
  text: string;
  done: boolean;
  created_by: string | null;
  created_at: string;
  profiles?: { full_name: string } | null;
}

export interface Receipt {
  id: string;
  uploaded_by: string;
  file_path: string;
  note: string | null;
  amount: number | null;
  created_at: string;
  profiles?: { full_name: string } | null;
}
